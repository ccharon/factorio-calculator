// Converts Factorio's data.raw dump and locale dump into the calculator's dataset format.
// The format is defined in src/data/dataset.schema.json. Icons are emitted as `icon_ref` strings
// ("<prototype-dir>/<name>" or "file:<game path>"), which sprites.js replaces with sheet positions.

import { parseEnergy, roundFloat } from "./units.js"

// Sorts by UTF-16 code units, like Array.prototype.sort() without a compare function.
function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0
}

// Lua serializes empty tables as {}, so every list field goes through this.
function asArray(x) {
    return Array.isArray(x) ? x : []
}

function isSkipped(proto) {
    return proto.parameter === true || proto.name.endsWith("-unknown")
}

/**
 * Looks up English names from the --dump-prototype-locale output.
 */
class Locale {
    /**
     * @param {Object<string, {names: Object<string, string>}>} files - Locale files keyed by prototype
     *     kind ("item", "recipe", "entity", ...).
     */
    constructor(files) {
        this.files = files
    }

    /**
     * Returns the localized name of a prototype, or its internal name if there is none.
     *
     * @param {string} kind - Locale file kind, such as "item" or "entity".
     * @param {string} name - Prototype name.
     * @returns {{en: string}}
     */
    name(kind, name) {
        return { en: this.files[kind]?.names?.[name] ?? name }
    }
}

/**
 * Normalizes one recipe or mining product into {type, name, amount} with amount as the
 * expected value per craft. Productivity-relevant details are kept as separate fields.
 *
 * @param {Object} p - A ProductPrototype from data.raw.
 * @returns {Object}
 */
export function normalizeProduct(p) {
    const base = p.amount ?? (p.amount_min + p.amount_max) / 2
    let probability = p.independent_probability ?? p.probability ?? 1
    if (p.shared_probability) {
        probability = p.shared_probability.max - p.shared_probability.min
    }
    const extra = p.extra_count_fraction ?? 0
    const out = {
        type: p.type ?? "item",
        name: p.name,
        amount: roundFloat((base + extra) * probability),
    }
    if (p.ignored_by_productivity) {
        // Expected value, like amount.
        out.ignored_by_productivity = roundFloat(Math.min(p.ignored_by_productivity, base) * probability)
    }
    if (p.temperature !== undefined) {
        out.temperature = p.temperature
    }
    if (p.percent_spoiled !== undefined) {
        out.percent_spoiled = p.percent_spoiled
    }
    return out
}

function normalizeIngredient(i) {
    return { type: i.type ?? "item", name: i.name, amount: i.amount }
}

function normalizeEnergySource(es) {
    if (!es) {
        return undefined
    }
    const out = { type: es.type }
    if (es.type === "burner") {
        out.fuel_categories = asArray(es.fuel_categories).length > 0 ? es.fuel_categories : ["chemical"]
        out.fuel_category = out.fuel_categories[0]
        out.effectivity = es.effectivity ?? 1
    }
    if (es.emissions_per_minute) {
        out.emissions_per_minute = es.emissions_per_minute
    }
    return out
}

function surfaceConditions(proto) {
    const conditions = asArray(proto.surface_conditions)
    return conditions.length > 0 ? conditions : undefined
}

// Copies only defined values, so optional fields stay absent instead of null.
/**
 * Returns the average light level over a day: full light between dawn and dusk, none between
 * evening and morning, and a linear change in between. Surfaces without daytime data are always lit.
 *
 * @param {{dusk: number, evening: number, morning: number, dawn: number} | undefined} daytime
 * @returns {number}
 */
export function solarFactor(daytime) {
    if (daytime === undefined) {
        return 1
    }
    const { dusk, evening, morning, dawn } = daytime
    return roundFloat(1 - (dawn - dusk) + (evening - dusk) / 2 + (dawn - morning) / 2)
}

function compact(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

/**
 * Builds the calculator dataset from a data.raw dump.
 *
 * @param {Object} raw - Parsed data-raw-dump.json.
 * @param {Object} localeFiles - Parsed *-locale.json files keyed by kind.
 * @param {string} version - Game version string, such as "2.1.21".
 * @param {{item_weights: Object<string, number>}} runtime - Values the game computes at runtime,
 *     from the helper mod in tools/lib/factorio.js. Weights are in grams.
 * @returns {Object} Dataset matching src/data/dataset.schema.json, with icon_ref placeholders.
 */
export function convert(raw, localeFiles, version, runtime) {
    const locale = new Locale(localeFiles)
    const subgroups = raw["item-subgroup"]

    const groups = {}
    for (const g of Object.values(raw["item-group"])) {
        groups[g.name] = { order: g.order ?? "", subgroups: {} }
    }
    for (const s of Object.values(subgroups)) {
        groups[s.group].subgroups[s.name] = s.order ?? ""
    }

    // Items: every prototype type whose entries have a stack size, plus fluids.
    const itemTypes = Object.keys(raw).filter(t => Object.values(raw[t]).some(p => p?.stack_size !== undefined))
    const itemProtos = new Map()
    for (const type of itemTypes) {
        for (const p of Object.values(raw[type])) {
            if (!isSkipped(p)) {
                itemProtos.set(p.name, p)
            }
        }
    }

    const items = []
    const fluids = []
    const fuel = []
    const spoilage = []
    for (const p of itemProtos.values()) {
        const subgroup = p.subgroup ?? "other"
        items.push(compact({
            key: p.name,
            localized_name: locale.name("item", p.name),
            type: p.type,
            group: subgroups[subgroup]?.group ?? "other",
            subgroup,
            order: p.order ?? "",
            stack_size: p.stack_size,
            weight: runtime.item_weights[p.name],
            icon_ref: `item/${p.name}`,
        }))
        if (p.fuel_value !== undefined && parseEnergy(p.fuel_value, "J") > 0) {
            fuel.push({ item_key: p.name, categories: asArray(p.fuel_categories ?? p.fuel_category ?? "chemical"), value: parseEnergy(p.fuel_value, "J") })
        }
        if (p.spoil_result && p.spoil_ticks) {
            spoilage.push({ from_item: p.name, to_item: p.spoil_result, time: p.spoil_ticks })
        }
    }

    for (const f of Object.values(raw.fluid)) {
        if (isSkipped(f)) {
            continue
        }
        const subgroup = f.subgroup ?? "fluid"
        items.push({
            key: f.name,
            localized_name: locale.name("fluid", f.name),
            type: "fluid",
            group: subgroups[subgroup]?.group ?? "intermediate-products",
            subgroup,
            order: f.order ?? "",
            icon_ref: `fluid/${f.name}`,
        })
        fluids.push(compact({
            item_key: f.name,
            default_temperature: f.default_temperature,
            max_temperature: f.max_temperature,
            heat_capacity: parseEnergy(f.heat_capacity ?? "1kJ", "J"),
            fuel_value: f.fuel_value === undefined ? undefined : parseEnergy(f.fuel_value, "J"),
        }))
    }

    const itemKeys = new Set(items.map(i => i.key))
    const itemByKey = new Map(items.map(i => [i.key, i]))

    // Recipes. Order and subgroup fall back to the main product, as in the game.
    const recipes = []
    for (const r of Object.values(raw.recipe)) {
        if (isSkipped(r)) {
            continue
        }
        const ingredients = asArray(r.ingredients).map(normalizeIngredient)
        const results = asArray(r.results).map(normalizeProduct)
        if ([...ingredients, ...results].some(x => !itemKeys.has(x.name))) {
            continue
        }
        // An empty main_product string means the recipe has none.
        const mainProduct = r.main_product || undefined
        const main = itemByKey.get(mainProduct ?? (results.length === 1 ? results[0].name : undefined))
        recipes.push(compact({
            key: r.name,
            localized_name: locale.name("recipe", r.name),
            categories: asArray(r.categories).length > 0 ? r.categories : ["crafting"],
            energy_required: r.energy_required ?? 0.5,
            allow_productivity: r.allow_productivity ?? false,
            maximum_productivity: r.maximum_productivity,
            ingredients,
            results,
            main_product: mainProduct,
            surface_conditions: surfaceConditions(r),
            order: r.order ?? main?.order ?? "",
            subgroup: r.subgroup ?? main?.subgroup ?? "other",
            hidden: r.hidden || undefined,
            icon_ref: `recipe/${r.name}`,
        }))
    }

    const machineFields = p => compact({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        energy_usage: parseEnergy(p.energy_usage, "W"),
        energy_source: normalizeEnergySource(p.energy_source),
        module_slots: p.module_slots ?? 0,
        allowed_effects: p.allowed_effects === undefined ? undefined : asArray(p.allowed_effects),
        surface_conditions: surfaceConditions(p),
        heating_energy: p.heating_energy === undefined ? undefined : parseEnergy(p.heating_energy, "W"),
        icon_ref: `entity/${p.name}`,
    })

    const crafting_machines = []
    for (const type of ["assembling-machine", "furnace"]) {
        for (const p of Object.values(raw[type])) {
            if (isSkipped(p)) {
                continue
            }
            crafting_machines.push({
                ...machineFields(p),
                crafting_categories: asArray(p.crafting_categories),
                crafting_speed: p.crafting_speed,
                crafting_speed_by_quality: runtime.crafting_speeds?.[p.name],
                prod_bonus: p.effect_receiver?.base_effect?.productivity ?? 0,
            })
        }
    }

    const rocket_silo = Object.values(raw["rocket-silo"]).map(p => ({
        ...machineFields(p),
        crafting_categories: asArray(p.crafting_categories),
        crafting_speed: p.crafting_speed,
        crafting_speed_by_quality: runtime.crafting_speeds?.[p.name],
        rocket_parts_required: p.rocket_parts_required,
    }))

    const mining_drills = Object.values(raw["mining-drill"]).map(p => compact({
        ...machineFields(p),
        mining_speed: p.mining_speed,
        resource_categories: asArray(p.resource_categories),
        resource_drain_rate_percent: p.resource_drain_rate_percent,
        takes_fluid: p.input_fluid_box !== undefined,
    }))

    const offshore_pumps = Object.values(raw["offshore-pump"]).map(p => ({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        pumping_speed: p.pumping_speed,
        icon_ref: `entity/${p.name}`,
    }))

    const boilers = Object.values(raw.boiler).map(p => compact({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        energy_consumption: parseEnergy(p.energy_consumption, "W"),
        energy_source: normalizeEnergySource(p.energy_source),
        target_temperature: p.target_temperature,
        icon_ref: `entity/${p.name}`,
    }))

    // Power generation: generators burn steam, solar panels and reactors.
    const generators = Object.values(raw.generator ?? {}).filter(p => !isSkipped(p)).map(p => ({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        fluid: p.fluid_box?.filter ?? "steam",
        fluid_usage: p.fluid_usage_per_tick * 60,
        maximum_temperature: p.maximum_temperature,
        effectivity: p.effectivity ?? 1,
        icon_ref: `entity/${p.name}`,
    }))
    const solar_panels = Object.values(raw["solar-panel"] ?? {}).filter(p => !isSkipped(p)).map(p => compact({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        production: parseEnergy(p.production, "W"),
        surface_conditions: surfaceConditions(p),
        icon_ref: `entity/${p.name}`,
    }))
    const reactors = Object.values(raw.reactor ?? {}).filter(p => !isSkipped(p)).map(p => ({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        consumption: parseEnergy(p.consumption, "W"),
        energy_source: normalizeEnergySource(p.energy_source),
        icon_ref: `entity/${p.name}`,
    }))

    // Fusion: the reactor turns a coolant into plasma, the generator turns plasma into electricity.
    const fusion_reactors = Object.values(raw["fusion-reactor"] ?? {}).filter(p => !isSkipped(p)).map(p => ({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        power_input: parseEnergy(p.power_input, "W"),
        fluid_usage: p.max_fluid_usage * 60,
        input_fluid: p.input_fluid_box?.filter,
        output_fluid: p.output_fluid_box?.filter,
        burner: normalizeEnergySource(p.burner),
        icon_ref: `entity/${p.name}`,
    }))
    const fusion_generators = Object.values(raw["fusion-generator"] ?? {}).filter(p => !isSkipped(p)).map(p => ({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        max_power_output: parseEnergy(p.energy_source?.output_flow_limit, "W"),
        fluid_usage: p.max_fluid_usage * 60,
        input_fluid: p.input_fluid_box?.filter,
        output_fluid: p.output_fluid_box?.filter,
        icon_ref: `entity/${p.name}`,
    }))

    const belts = Object.values(raw["transport-belt"]).map(p => ({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        speed: p.speed,
        icon_ref: `entity/${p.name}`,
    }))

    const b = raw.beacon.beacon
    const beacon = compact({
        key: b.name,
        energy_usage: parseEnergy(b.energy_usage, "W"),
        distribution_effectivity: b.distribution_effectivity,
        distribution_effectivity_bonus_per_quality_level: b.distribution_effectivity_bonus_per_quality_level,
        module_slots: b.module_slots,
        allowed_effects: asArray(b.allowed_effects),
        profile: asArray(b.profile).length > 0 ? b.profile : [1],
    })

    const modules = Object.values(raw.module).filter(m => !isSkipped(m)).map(m => ({
        item_key: m.name,
        category: m.category,
        tier: m.tier,
        effect: m.effect ?? {},
        effect_by_quality: runtime.module_effects?.[m.name],
    }))

    // Quality levels, from lowest to highest. The runtime data gives the effects that quality changes.
    const qualities = Object.entries(runtime.qualities ?? {}).map(([name, q]) => ({
        key: name,
        localized_name: locale.name("quality", name),
        level: q.level,
        icon_ref: `quality/${name}`,
    })).sort((a, b) => a.level - b.level)

    // The tower plants into a grid of growth_grid_tile_size cells (default 3) that reaches radius cells
    // beyond the cells its collision box covers. The tower's own cells hold no plants.
    const agricultural_tower = Object.values(raw["agricultural-tower"]).map(p => {
        const grid = p.growth_grid_tile_size ?? 3
        const [[x0], [x1]] = p.collision_box ?? [[0], [0]]
        const own = Math.max(1, Math.ceil((x1 - x0) / grid))
        return compact({
            ...machineFields(p),
            radius: p.radius,
            plots: (own + 2 * p.radius) ** 2 - own ** 2,
        })
    })

    // Technologies that raise the productivity of recipes, one level at a time.
    const recipe_productivity = []
    for (const t of Object.values(raw.technology ?? {})) {
        const effects = asArray(t.effects).filter(e => e.type === "change-recipe-productivity").map(e => ({ recipe: e.recipe, change: e.change }))
        if (effects.length === 0 || t.hidden || isSkipped(t)) {
            continue
        }
        recipe_productivity.push(compact({
            key: t.name,
            localized_name: locale.name("technology", t.name),
            order: t.order ?? "",
            max_level: t.max_level === "infinite" ? undefined : t.max_level,
            effects,
            icon_ref: `technology/${t.name}`,
        }))
    }
    recipe_productivity.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

    // Asteroid chunks a space platform can collect: chunks that spawn anywhere, and chunks that
    // spawning asteroids break into when they are destroyed.
    const chunksOf = (asteroid, seen = new Set()) => {
        if (seen.has(asteroid)) {
            return []
        }
        seen.add(asteroid)
        // A trigger effect is a single effect or a list of them.
        const effect = raw.asteroid?.[asteroid]?.dying_trigger_effect
        return (Array.isArray(effect) ? effect : effect ? [effect] : []).flatMap(e => {
            if (e.type === "create-asteroid-chunk") {
                return [e.asteroid_name]
            }
            return e.type === "create-entity" ? chunksOf(e.entity_name, seen) : []
        })
    }
    const asteroidChunks = new Set()
    const spawners = [...Object.values(raw.planet), ...Object.values(raw["space-location"] ?? {}), ...Object.values(raw["space-connection"] ?? {})]
    for (const def of spawners.flatMap(s => asArray(s.asteroid_spawn_definitions))) {
        const chunks = def.type === "asteroid-chunk" ? [def.asteroid] : chunksOf(def.asteroid)
        chunks.filter(c => raw["asteroid-chunk"]?.[c] && !isSkipped(raw["asteroid-chunk"][c])).forEach(c => asteroidChunks.add(c))
    }

    // Planets and their resources. Plants belong to a planet through their autoplace control.
    const planetResources = new Set()
    const planets = []
    for (const p of Object.values(raw.planet)) {
        const mgs = p.map_gen_settings ?? {}
        const controls = new Set(Object.keys(mgs.autoplace_controls ?? {}))
        const entities = Object.keys(mgs.autoplace_settings?.entity?.settings ?? {})
        const tiles = Object.keys(mgs.autoplace_settings?.tile?.settings ?? {})
        const resource = entities.filter(e => raw.resource[e]).sort(compareStrings)
        resource.forEach(r => planetResources.add(r))
        planets.push({
            key: p.name,
            localized_name: locale.name("space-location", p.name),
            order: p.order ?? "",
            surface_properties: p.surface_properties ?? {},
            solar_factor: solarFactor(runtime.daytime?.[p.name]),
            requires_heating: p.entities_require_heating ?? false,
            resources: {
                resource,
                offshore: [...new Set(tiles.map(t => raw.tile[t]?.fluid).filter(Boolean))].sort(compareStrings),
                plants: Object.values(raw.plant).filter(pl => controls.has(pl.autoplace?.control)).map(pl => pl.name).sort(compareStrings),
                asteroid: [],
            },
            icon_ref: `space-location/${p.name}`,
        })
    }

    for (const s of Object.values(raw.surface)) {
        planets.push({
            key: s.name,
            localized_name: locale.name("surface", s.name),
            order: s.order ?? "",
            surface_properties: s.surface_properties ?? {},
            solar_factor: solarFactor(undefined),
            requires_heating: false,
            resources: { resource: [], offshore: [], plants: [], asteroid: [...asteroidChunks].sort(compareStrings) },
            icon_ref: `surface/${s.name}`,
        })
    }

    const resources = Object.values(raw.resource).filter(r => planetResources.has(r.name)).map(r => {
        const m = r.minable
        const results = m.results ? asArray(m.results).map(normalizeProduct) : [{ type: "item", name: m.result, amount: m.count ?? 1 }]
        return compact({
            key: r.name,
            localized_name: locale.name("entity", r.name),
            category: r.category ?? "basic-solid",
            mining_time: m.mining_time,
            results,
            required_fluid: m.required_fluid,
            fluid_amount: m.fluid_amount,
            infinite: r.infinite || undefined,
            order: r.order,
            icon_ref: `entity/${r.name}`,
        })
    })

    const seeds = new Map()
    for (const p of itemProtos.values()) {
        if (p.plant_result) {
            seeds.set(p.plant_result, p.name)
        }
    }

    const plants = Object.values(raw.plant).map(p => compact({
        key: p.name,
        localized_name: locale.name("entity", p.name),
        order: p.order ?? "",
        seed: seeds.get(p.name),
        growth_ticks: p.growth_ticks,
        results: asArray(p.minable?.results).map(normalizeProduct),
        surface_conditions: surfaceConditions(p),
        icon_ref: `entity/${p.name}`,
    }))

    const surface_properties = Object.values(raw["surface-property"]).map(s => ({
        name: s.name,
        default_value: s.default_value,
    }))

    const utility = raw["utility-sprites"].default
    const sprites = {
        extra: {
            clock: { name: "time", icon_ref: `file:${utility.clock.filename}` },
            slot_icon_module: { name: "no module", icon_ref: `file:${utility.empty_module_slot.filename}` },
            electricity: { name: "Electricity", icon_ref: "virtual-signal/signal-lightning" },
            heat: { name: "Heat", icon_ref: "virtual-signal/signal-thermometer-red" },
        },
    }

    const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    return {
        version,
        groups,
        items: items.sort(byKey),
        fluids,
        fuel,
        spoilage,
        recipes: recipes.sort(byKey),
        crafting_machines,
        rocket_silo,
        mining_drills,
        offshore_pumps,
        boilers,
        generators,
        solar_panels,
        reactors,
        fusion_reactors,
        fusion_generators,
        belts,
        beacon,
        modules,
        agricultural_tower,
        planets,
        resources,
        plants,
        surface_properties,
        recipe_productivity,
        qualities,
        rocket_lift_weight: raw["utility-constants"].default.default_rocket_lift_weight,
        sprites,
    }
}

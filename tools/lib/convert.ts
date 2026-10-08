// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Converts Factorio's data.raw dump and locale dump into the calculator's dataset format.
// The format is defined in src/data/dataset.schema.json. Icons are emitted as `icon_ref` strings
// ("<prototype-dir>/<name>" or "file:<game path>"), which sprites.ts replaces with sheet positions.

import type {
    Dataset, DatasetAgriculturalTower, DatasetBeacon, DatasetBelt, DatasetBoiler, DatasetCraftingMachine, DatasetFluid, DatasetFuel, DatasetFusionGenerator,
    DatasetFusionReactor, DatasetGenerator, DatasetIngredient, DatasetItem, DatasetMachine, DatasetMiningDrill, DatasetModule, DatasetOffshorePump, DatasetPlanet,
    DatasetPlant, DatasetProduct, DatasetQuality, DatasetReactor, DatasetRecipe, DatasetRecipeProductivity, DatasetResource, DatasetRocketSilo, DatasetSolarPanel,
    DatasetSpoilage, DatasetSurfaceProperty, EffectName, EnergySource, IconPosition, ItemGroupData, LocalizedName, NamedPrototype, SurfaceConditionData,
} from "../../src/data/dataset.ts"
import { DEFAULT_FUEL_CATEGORY, TICKS_PER_SECOND } from "../../src/data/game.ts"
import type {
    LocaleFiles, LuaList, RawData, RawEnergySource, RawEntity, RawIngredient, RawItem, RawPrototype, RawProduct, RawSpaceLocation, RawTable, RawTriggerEffect, RuntimeData,
} from "./raw.ts"
import { parseEnergy, roundFloat } from "./units.ts"

/** A dataset entry with an icon_ref placeholder in place of its sprite sheet position. */
export type WithIconRef<T> = T extends IconPosition ? Omit<T, "icon_col" | "icon_row"> & { icon_ref: string } : T

/** An extra sprite before sprites.ts places it. */
export interface ExtraSpriteRef {
    name: string
    icon_ref: string
}

/** The dataset as convert() returns it: icons are icon_ref placeholders, and the sprite sheet is not built yet. */
export type ConvertedDataset = {
    [K in Exclude<keyof Dataset, "sprites">]: Dataset[K] extends (infer U)[] ? WithIconRef<U>[] : WithIconRef<Dataset[K]>
} & { sprites: { extra: Record<string, ExtraSpriteRef> } }

/** Compares by UTF-16 code units, like Array.prototype.sort() without a compare function. */
export function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0
}

// Lua serializes empty tables as {}, so every list field goes through this.
function asArray<T>(x: LuaList<T> | T | undefined): readonly T[] {
    return Array.isArray(x) ? x : []
}

function isSkipped(proto: RawPrototype): boolean {
    return proto.parameter === true || proto.name.endsWith("-unknown")
}

// Returns the tables of all item types: every prototype type whose entries have a stack size.
function itemTables(raw: RawData): RawTable<RawItem>[] {
    // Item types are many and change between versions, so they are found by their content.
    const tables = Object.values(raw as unknown as Readonly<Record<string, RawTable<RawItem>>>)
    return tables.filter(table => prototypes(table).some(p => p.stack_size !== undefined))
}

// Returns the prototypes of one type, or none if the dump has no such type.
function prototypes<T extends RawPrototype>(table: Readonly<Record<string, T>> | undefined): T[] {
    return Object.values(table ?? {})
}

/**
 * Looks up English names from the --dump-prototype-locale output.
 */
class Locale {
    private readonly files: LocaleFiles

    /**
     * @param files - Locale files keyed by prototype kind ("item", "recipe", "entity", ...).
     */
    constructor(files: LocaleFiles) {
        this.files = files
    }

    /**
     * Returns the localized name of a prototype, or its internal name if there is none.
     *
     * @param kind - Locale file kind, such as "item" or "entity".
     */
    name(kind: string, name: string): LocalizedName {
        return { en: this.files[kind]?.names?.[name] ?? name }
    }
}

/**
 * Normalizes one recipe or mining product into {type, name, amount} with amount as the
 * expected value per craft. Productivity-relevant details are kept as separate fields.
 *
 * @param p - A ProductPrototype from data.raw.
 */
export function normalizeProduct(p: RawProduct): DatasetProduct {
    const base = p.amount ?? ((p.amount_min ?? 0) + (p.amount_max ?? 0)) / 2
    let probability = p.independent_probability ?? p.probability ?? 1
    if (p.shared_probability) {
        probability = p.shared_probability.max - p.shared_probability.min
    }
    const extra = p.extra_count_fraction ?? 0
    const out: DatasetProduct = {
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

function normalizeIngredient(i: RawIngredient): DatasetIngredient {
    return { type: i.type ?? "item", name: i.name, amount: i.amount }
}

function normalizeEnergySource(es: RawEnergySource | undefined): EnergySource | undefined {
    if (!es) {
        return undefined
    }
    const out: EnergySource = { type: es.type }
    if (es.type === "burner") {
        const categories = asArray(es.fuel_categories)
        out.fuel_categories = categories.length > 0 ? [...categories] : [DEFAULT_FUEL_CATEGORY]
        out.fuel_category = out.fuel_categories[0]
        out.effectivity = es.effectivity ?? 1
    }
    if (es.emissions_per_minute) {
        out.emissions_per_minute = { ...es.emissions_per_minute }
    }
    return out
}

function surfaceConditions(proto: { readonly surface_conditions?: LuaList<SurfaceConditionData> }): SurfaceConditionData[] | undefined {
    const conditions = asArray(proto.surface_conditions)
    return conditions.length > 0 ? [...conditions] : undefined
}

/**
 * Returns the average light level over a day: full light between dawn and dusk, none between
 * evening and morning, and a linear change in between. Surfaces without daytime data are always lit.
 *
 * @param daytime - The daytime parameters of a surface.
 */
export function solarFactor(daytime: { readonly dusk: number, readonly evening: number, readonly morning: number, readonly dawn: number } | undefined): number {
    if (daytime === undefined) {
        return 1
    }
    const { dusk, evening, morning, dawn } = daytime
    return roundFloat(1 - (dawn - dusk) + (evening - dusk) / 2 + (dawn - morning) / 2)
}

// Returns value, or throws if the prototype lacks a field that the dataset requires.
function need<T>(value: T | undefined, proto: RawPrototype, field: string): T {
    if (value === undefined) {
        throw new Error(`${proto.name} has no ${field}`)
    }
    return value
}

// Copies only defined values, so optional fields stay absent instead of null.
function compact<T extends object>(obj: T): T {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

/**
 * Builds the calculator dataset from a data.raw dump.
 *
 * @param raw - Parsed data-raw-dump.json.
 * @param localeFiles - Parsed *-locale.json files keyed by kind.
 * @param version - Game version string, such as "2.1.21".
 * @param runtime - Values the game computes at runtime, from the helper mod in tools/lib/factorio.ts.
 * @returns Dataset matching src/data/dataset.schema.json, with icon_ref placeholders.
 */
export function convert(raw: RawData, localeFiles: LocaleFiles, version: string, runtime: RuntimeData): ConvertedDataset {
    const locale = new Locale(localeFiles)
    const subgroups = raw["item-subgroup"]

    const groups: Record<string, ItemGroupData> = {}
    for (const g of prototypes(raw["item-group"])) {
        groups[g.name] = { order: g.order ?? "", subgroups: {} }
    }
    for (const s of prototypes(subgroups)) {
        const group = groups[s.group]
        if (group !== undefined) {
            group.subgroups[s.name] = s.order ?? ""
        }
    }

    // Items: every prototype type whose entries have a stack size, plus fluids.
    const itemProtos = new Map<string, RawItem>()
    for (const table of itemTables(raw)) {
        for (const p of prototypes(table)) {
            if (!isSkipped(p)) {
                itemProtos.set(p.name, p)
            }
        }
    }

    const items: WithIconRef<DatasetItem>[] = []
    const fluids: DatasetFluid[] = []
    const fuel: DatasetFuel[] = []
    const spoilage: DatasetSpoilage[] = []
    for (const p of itemProtos.values()) {
        const subgroup = p.subgroup ?? "other"
        items.push(compact<WithIconRef<DatasetItem>>({
            key: p.name,
            localized_name: locale.name("item", p.name),
            type: need(p.type, p, "type"),
            group: subgroups[subgroup]?.group ?? "other",
            subgroup,
            order: p.order ?? "",
            stack_size: p.stack_size,
            weight: runtime.item_weights[p.name],
            icon_ref: `item/${p.name}`,
        }))
        const fuelValue = parseEnergy(p.fuel_value, "J") ?? 0
        if (fuelValue > 0) {
            fuel.push({ item_key: p.name, categories: [...asArray(p.fuel_categories ?? p.fuel_category ?? DEFAULT_FUEL_CATEGORY)], value: fuelValue })
        }
        if (p.spoil_result && p.spoil_ticks) {
            spoilage.push({ from_item: p.name, to_item: p.spoil_result, time: p.spoil_ticks })
        }
    }

    for (const f of prototypes(raw.fluid)) {
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
        fluids.push(compact<DatasetFluid>({
            item_key: f.name,
            default_temperature: need(f.default_temperature, f, "default_temperature"),
            max_temperature: f.max_temperature,
            heat_capacity: need(parseEnergy(f.heat_capacity ?? "1kJ", "J"), f, "heat_capacity"),
            fuel_value: parseEnergy(f.fuel_value, "J"),
        }))
    }

    const itemKeys = new Set(items.map(i => i.key))
    const itemByKey = new Map(items.map(i => [i.key, i]))

    // Recipes. Order and subgroup fall back to the main product, as in the game.
    const recipes: WithIconRef<DatasetRecipe>[] = []
    for (const r of prototypes(raw.recipe)) {
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
        const main = itemByKey.get(mainProduct ?? (results.length === 1 ? results[0]?.name ?? "" : ""))
        recipes.push(compact<WithIconRef<DatasetRecipe>>({
            key: r.name,
            localized_name: locale.name("recipe", r.name),
            categories: asArray(r.categories).length > 0 ? [...asArray(r.categories)] : ["crafting"],
            energy_required: r.energy_required ?? 0.5,
            allow_productivity: r.allow_productivity ?? false,
            allow_quality: r.allow_quality ?? true,
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

    const entityFields = (p: RawPrototype): WithIconRef<NamedPrototype> => ({ key: p.name, localized_name: locale.name("entity", p.name), icon_ref: `entity/${p.name}` })

    const machineFields = (p: RawEntity): WithIconRef<DatasetMachine> => compact<WithIconRef<DatasetMachine>>({
        ...entityFields(p),
        energy_usage: parseEnergy(p.energy_usage, "W"),
        energy_source: normalizeEnergySource(p.energy_source),
        module_slots: p.module_slots ?? 0,
        allowed_effects: p.allowed_effects === undefined ? undefined : [...asArray(p.allowed_effects)] as EffectName[],
        surface_conditions: surfaceConditions(p),
        heating_energy: parseEnergy(p.heating_energy, "W"),
    })

    const crafting_machines: WithIconRef<DatasetCraftingMachine>[] = []
    for (const table of [raw["assembling-machine"], raw.furnace]) {
        for (const p of prototypes(table)) {
            if (isSkipped(p)) {
                continue
            }
            crafting_machines.push({
                ...machineFields(p),
                crafting_categories: [...asArray(p.crafting_categories)],
                crafting_speed: need(p.crafting_speed, p, "crafting_speed"),
                crafting_speed_by_quality: runtime.crafting_speeds?.[p.name],
                prod_bonus: p.effect_receiver?.base_effect?.productivity ?? 0,
            })
        }
    }

    const rocket_silo = prototypes(raw["rocket-silo"]).map((p): WithIconRef<DatasetRocketSilo> => ({
        ...machineFields(p),
        crafting_categories: [...asArray(p.crafting_categories)],
        crafting_speed: need(p.crafting_speed, p, "crafting_speed"),
        crafting_speed_by_quality: runtime.crafting_speeds?.[p.name],
        rocket_parts_required: need(p.rocket_parts_required, p, "rocket_parts_required"),
        launch_by_quality: Object.fromEntries(Object.entries(need(runtime.rocket_launch?.[p.name], p, "launch_by_quality")).map(([quality, l]) => [
            quality, { ...l, reopen: l.reopen.map(([first, last]): [number, number] => [first, last]) },
        ])),
    }))

    const mining_drills = prototypes(raw["mining-drill"]).map(p => compact<WithIconRef<DatasetMiningDrill>>({
        ...machineFields(p),
        mining_speed: need(p.mining_speed, p, "mining_speed"),
        resource_categories: [...asArray(p.resource_categories)],
        resource_drain_rate_percent: p.resource_drain_rate_percent,
        takes_fluid: p.input_fluid_box !== undefined,
    }))

    const offshore_pumps = prototypes(raw["offshore-pump"]).map((p): WithIconRef<DatasetOffshorePump> => ({
        ...entityFields(p),
        pumping_speed: need(p.pumping_speed, p, "pumping_speed"),
    }))

    const boilers = prototypes(raw["boiler"]).map(p => compact<WithIconRef<DatasetBoiler>>({
        ...entityFields(p),
        energy_consumption: need(parseEnergy(p.energy_consumption, "W"), p, "energy_consumption"),
        energy_source: need(normalizeEnergySource(p.energy_source), p, "energy_source"),
        target_temperature: need(p.target_temperature, p, "target_temperature"),
    }))

    // Power generation: generators burn steam, solar panels and reactors.
    const generators = prototypes(raw["generator"]).filter(p => !isSkipped(p)).map((p): WithIconRef<DatasetGenerator> => ({
        ...entityFields(p),
        fluid: p.fluid_box?.filter ?? "steam",
        fluid_usage: need(p.fluid_usage_per_tick, p, "fluid_usage_per_tick") * TICKS_PER_SECOND,
        maximum_temperature: need(p.maximum_temperature, p, "maximum_temperature"),
        effectivity: p.effectivity ?? 1,
    }))
    const solar_panels = prototypes(raw["solar-panel"]).filter(p => !isSkipped(p)).map(p => compact<WithIconRef<DatasetSolarPanel>>({
        ...entityFields(p),
        production: need(parseEnergy(p.production, "W"), p, "production"),
        surface_conditions: surfaceConditions(p),
    }))
    const reactors = prototypes(raw["reactor"]).filter(p => !isSkipped(p)).map((p): WithIconRef<DatasetReactor> => ({
        ...entityFields(p),
        consumption: need(parseEnergy(p.consumption, "W"), p, "consumption"),
        neighbour_bonus: p.neighbour_bonus ?? 1,
        energy_source: need(normalizeEnergySource(p.energy_source), p, "energy_source"),
    }))

    // Fusion: the reactor turns a coolant into plasma, the generator turns plasma into electricity.
    const fusion_reactors = prototypes(raw["fusion-reactor"]).filter(p => !isSkipped(p)).map((p): WithIconRef<DatasetFusionReactor> => ({
        ...entityFields(p),
        power_input: need(parseEnergy(p.power_input, "W"), p, "power_input"),
        fluid_usage: need(p.max_fluid_usage, p, "max_fluid_usage") * TICKS_PER_SECOND,
        input_fluid: need(p.input_fluid_box?.filter, p, "input_fluid_box.filter"),
        output_fluid: need(p.output_fluid_box?.filter, p, "output_fluid_box.filter"),
        burner: need(normalizeEnergySource(p.burner), p, "burner"),
    }))
    const fusion_generators = prototypes(raw["fusion-generator"]).filter(p => !isSkipped(p)).map((p): WithIconRef<DatasetFusionGenerator> => ({
        ...entityFields(p),
        max_power_output: need(parseEnergy(p.energy_source?.output_flow_limit, "W"), p, "output_flow_limit"),
        fluid_usage: need(p.max_fluid_usage, p, "max_fluid_usage") * TICKS_PER_SECOND,
        input_fluid: need(p.input_fluid_box?.filter, p, "input_fluid_box.filter"),
        output_fluid: need(p.output_fluid_box?.filter, p, "output_fluid_box.filter"),
    }))

    const belts = prototypes(raw["transport-belt"]).map((p): WithIconRef<DatasetBelt> => ({
        ...entityFields(p),
        speed: need(p.speed, p, "speed"),
    }))

    const b = raw.beacon["beacon"]
    if (b === undefined) {
        throw new Error("data.raw lacks the beacon")
    }
    const beacon = compact<DatasetBeacon>({
        key: b.name,
        energy_usage: need(parseEnergy(b.energy_usage, "W"), b, "energy_usage"),
        distribution_effectivity: need(b.distribution_effectivity, b, "distribution_effectivity"),
        distribution_effectivity_bonus_per_quality_level: b.distribution_effectivity_bonus_per_quality_level,
        module_slots: need(b.module_slots, b, "module_slots"),
        allowed_effects: [...asArray(b.allowed_effects)] as EffectName[],
        profile: asArray(b.profile).length > 0 ? [...asArray(b.profile)] : [1],
    })

    const modules = prototypes(raw.module).filter(m => !isSkipped(m)).map((m): DatasetModule => ({
        item_key: m.name,
        category: need(m.category, m, "category"),
        tier: need(m.tier, m, "tier"),
        effect: m.effect ?? {},
        effect_by_quality: runtime.module_effects?.[m.name],
    }))

    // Quality levels, from lowest to highest. The runtime data gives the effects that quality changes.
    // next_probability and chain_probability have the defaults of the prototype docs.
    const qualities = Object.entries(runtime.qualities ?? {}).map(([name, q]) => {
        const proto = raw.quality?.[name]
        const nextProbability = proto?.next ? proto.next_probability ?? 0 : 0
        return compact<WithIconRef<DatasetQuality>>({
            key: name,
            localized_name: locale.name("quality", name),
            level: q.level,
            next: proto?.next,
            next_probability: nextProbability,
            chain_probability: proto?.chain_probability ?? Math.min(Math.max(nextProbability * 0.1, 0), 1),
            icon_ref: `quality/${name}`,
        })
    }).sort((a, b) => a.level - b.level)

    // The tower plants into a grid of growth_grid_tile_size cells (default 3) that reaches radius cells
    // beyond the cells its collision box covers. The tower's own cells hold no plants.
    const agricultural_tower = prototypes(raw["agricultural-tower"]).map(p => {
        const grid = p.growth_grid_tile_size ?? 3
        const [[x0], [x1]] = p.collision_box ?? [[0, 0], [0, 0]]
        const own = Math.max(1, Math.ceil((x1 - x0) / grid))
        const radius = need(p.radius, p, "radius")
        return compact<WithIconRef<DatasetAgriculturalTower>>({
            ...machineFields(p),
            radius: p.radius,
            plots: (own + 2 * radius) ** 2 - own ** 2,
        })
    })

    // Technologies that raise the productivity of recipes, one level at a time.
    const recipe_productivity: WithIconRef<DatasetRecipeProductivity>[] = []
    for (const t of prototypes(raw.technology)) {
        const effects = asArray(t.effects).filter(e => e.type === "change-recipe-productivity").map(e => ({ recipe: need(e.recipe, t, "effects.recipe"), change: need(e.change, t, "effects.change") }))
        if (effects.length === 0 || t.hidden || isSkipped(t)) {
            continue
        }
        recipe_productivity.push(compact<WithIconRef<DatasetRecipeProductivity>>({
            key: t.name,
            localized_name: locale.name("technology", t.name),
            order: t.order ?? "",
            max_level: t.max_level === "infinite" ? undefined : t.max_level,
            effects,
            icon_ref: `technology/${t.name}`,
        }))
    }
    recipe_productivity.sort((a, b) => compareStrings(a.key, b.key))

    // Asteroid chunks a space platform can collect: chunks that spawn anywhere, and chunks that
    // spawning asteroids break into when they are destroyed.
    const chunksOf = (asteroid: string, seen = new Set<string>()): string[] => {
        if (seen.has(asteroid)) {
            return []
        }
        seen.add(asteroid)
        // A trigger effect is a single effect or a list of them.
        const effect = raw.asteroid?.[asteroid]?.dying_trigger_effect
        const effects: readonly RawTriggerEffect[] = Array.isArray(effect) ? effect : effect ? [effect as RawTriggerEffect] : []
        return effects.flatMap(e => {
            if (e.type === "create-asteroid-chunk") {
                return e.asteroid_name === undefined ? [] : [e.asteroid_name]
            }
            return e.type === "create-entity" && e.entity_name !== undefined ? chunksOf(e.entity_name, seen) : []
        })
    }
    const asteroidChunks = new Set<string>()
    const spawners: RawSpaceLocation[] = [...prototypes(raw.planet), ...prototypes(raw["space-location"]), ...prototypes(raw["space-connection"])]
    for (const def of spawners.flatMap(s => asArray(s.asteroid_spawn_definitions))) {
        const chunks = def.type === "asteroid-chunk" ? [def.asteroid] : chunksOf(def.asteroid)
        for (const c of chunks) {
            const chunk = raw["asteroid-chunk"]?.[c]
            if (chunk !== undefined && !isSkipped(chunk)) {
                asteroidChunks.add(c)
            }
        }
    }

    // Planets and their resources. Plants belong to a planet through their autoplace control.
    const planetResources = new Set<string>()
    const planets: WithIconRef<DatasetPlanet>[] = []
    for (const p of prototypes(raw.planet)) {
        const mgs = p.map_gen_settings ?? {}
        const controls = new Set(Object.keys(mgs.autoplace_controls ?? {}))
        const entities = Object.keys(mgs.autoplace_settings?.entity?.settings ?? {})
        const tiles = Object.keys(mgs.autoplace_settings?.tile?.settings ?? {})
        const resource = entities.filter(e => raw.resource[e] !== undefined).sort(compareStrings)
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
                offshore: [...new Set(tiles.map(t => raw.tile[t]?.fluid).filter((f): f is string => Boolean(f)))].sort(compareStrings),
                plants: prototypes(raw.plant).filter(pl => controls.has(pl.autoplace?.control ?? "")).map(pl => pl.name).sort(compareStrings),
                asteroid: [],
            },
            icon_ref: `space-location/${p.name}`,
        })
    }

    for (const s of prototypes(raw.surface)) {
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

    const resources = prototypes(raw.resource).filter(r => planetResources.has(r.name)).map(r => {
        const m = need(r.minable, r, "minable")
        const results: DatasetProduct[] = m.results ? asArray(m.results).map(normalizeProduct) : [{ type: "item", name: need(m.result, r, "minable.result"), amount: m.count ?? 1 }]
        return compact<WithIconRef<DatasetResource>>({
            ...entityFields(r),
            category: r.category ?? "basic-solid",
            mining_time: need(m.mining_time, r, "minable.mining_time"),
            results,
            required_fluid: m.required_fluid,
            fluid_amount: m.fluid_amount,
            infinite: r.infinite || undefined,
            order: r.order,
        })
    })

    const seeds = new Map<string, string>()
    for (const p of itemProtos.values()) {
        if (p.plant_result) {
            seeds.set(p.plant_result, p.name)
        }
    }

    const plants = prototypes(raw.plant).map(p => compact<WithIconRef<DatasetPlant>>({
        ...entityFields(p),
        order: p.order ?? "",
        seed: need(seeds.get(p.name), p, "seed"),
        growth_ticks: need(p.growth_ticks, p, "growth_ticks"),
        results: asArray(p.minable?.results).map(normalizeProduct),
        surface_conditions: surfaceConditions(p),
    }))

    const surface_properties = prototypes(raw["surface-property"]).map((s): DatasetSurfaceProperty => ({
        name: s.name,
        default_value: s.default_value,
    }))

    const utility = raw["utility-sprites"]["default"]
    const constants = raw["utility-constants"]["default"]
    if (utility === undefined || constants === undefined) {
        throw new Error("data.raw lacks the utility sprites or constants")
    }
    const sprites = {
        extra: {
            clock: { name: "time", icon_ref: `file:${utility.clock.filename}` },
            slot_icon_module: { name: "no module", icon_ref: `file:${utility.empty_module_slot.filename}` },
            electricity: { name: "Electricity", icon_ref: "virtual-signal/signal-lightning" },
            heat: { name: "Heat", icon_ref: "virtual-signal/signal-thermometer-red" },
        },
    }

    const byKey = (a: { key: string }, b: { key: string }): number => compareStrings(a.key, b.key)
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
        rocket_lift_weight: constants.default_rocket_lift_weight,
        sprites,
    }
}

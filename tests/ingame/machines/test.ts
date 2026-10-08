// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Single machines: crafting speed, modules, beacons, quality, research, fuel, electricity, heat and
// planets, from simple cases to machines that combine many of them. build.lua in this directory
// builds them.

import { type Calculator } from "../framework/calculator.ts"
import { type Beacons, type Comparison, type FactoryData, type FactoryResult, type IngameTest, type Measured, absolute, counter, relative } from "../framework/test.ts"

/** One machine that crafts one recipe without interruption, or a mining drill on an ore patch. */
interface MachineFactory extends FactoryData {
    /** Entity key of the machine. */
    readonly machine: string
    readonly machine_quality?: string
    /** Recipe key. For a mining drill the key of the resource, which is also its recipe in the calculator. */
    readonly recipe: string
    /** The product that the test counts, in all qualities. */
    readonly item: string
    readonly modules?: readonly string[]
    readonly module_quality?: string
    readonly beacons?: Beacons
    /** The item a burner machine burns. */
    readonly fuel?: string
    /** Resource entity under a mining drill. */
    readonly resource?: string
    /** Fluid that a mining drill needs for the resource. */
    readonly fluid?: string
    /** Mining productivity bonus, such as 0.5 for +50%. */
    readonly mining_productivity?: number
    /** A recipe productivity technology and its researched level. */
    readonly research?: { readonly technology: string, readonly level: number }
    /** True if the machine gets no ingredients, so that only its idle drain counts. */
    readonly idle?: boolean
    /** True to compare the products of every quality, for machines with quality modules. */
    readonly qualities?: boolean
}

/** What the calculator computes for one machine. */
interface Expected {
    /** Products per second by quality key. */
    readonly products: Readonly<Record<string, number>>
    /** Power in W: burner fuel or electricity including the idle drain. */
    readonly power: number
    /** Idle drain in W. */
    readonly drain: number
    /** Heat in W that keeps the machine from freezing. */
    readonly heat: number
    readonly burner: boolean
}

// A window can cut one craft at each end, and a craft with productivity can finish one product more.
const PRODUCT_TOLERANCE = 3
// Energy buffers of the machines make the measured energy differ slightly.
const ENERGY_TOLERANCE = 0.005

const gears = { recipe: "iron-gear-wheel", item: "iron-gear-wheel" }
const speedBeacons = (count: number): Beacons => ({ count, modules: ["speed-module-3", "speed-module-3"] })
const times = (count: number, module: string): string[] => Array.from({ length: count }, () => module)

const FACTORIES: readonly MachineFactory[] = [
    // Nauvis, one mechanic at a time.
    { name: "assembler-1-gears", machine: "assembling-machine-1", ...gears },
    { name: "assembler-2-gears", machine: "assembling-machine-2", ...gears },
    { name: "assembler-3-gears", machine: "assembling-machine-3", ...gears },
    { name: "assembler-3-productivity", machine: "assembling-machine-3", ...gears, modules: times(4, "productivity-module-3") },
    { name: "assembler-3-speed", machine: "assembling-machine-3", ...gears, modules: times(4, "speed-module-3") },
    { name: "assembler-3-efficiency", machine: "assembling-machine-3", ...gears, modules: times(4, "efficiency-module-3") },
    { name: "assembler-3-idle", machine: "assembling-machine-3", ...gears, idle: true },
    { name: "assembler-3-1-beacon", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(1) },
    { name: "assembler-3-2-beacons", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(2) },
    { name: "assembler-3-4-beacons", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(4) },
    { name: "stone-furnace-coal", machine: "stone-furnace", recipe: "iron-plate", item: "iron-plate", fuel: "coal" },
    {
        name: "electric-furnace-steel-cap", machine: "electric-furnace", recipe: "steel-plate", item: "steel-plate",
        modules: times(2, "productivity-module-3"), research: { technology: "steel-plate-productivity", level: 30 },
    },
    {
        name: "electric-drill-iron-ore", machine: "electric-mining-drill", recipe: "iron-ore", item: "iron-ore",
        resource: "iron-ore", mining_productivity: 0.5,
    },

    // Quality.
    {
        name: "assembler-3-quality", machine: "assembling-machine-3", ...gears,
        modules: times(4, "quality-module-3"), module_quality: "legendary", qualities: true, window: 108000,
    },
    {
        name: "big-drill-uranium-acid", machine: "big-mining-drill", machine_quality: "rare", recipe: "uranium-ore", item: "uranium-ore",
        resource: "uranium-ore", fluid: "sulfuric-acid", modules: times(4, "productivity-module-3"), module_quality: "uncommon", mining_productivity: 0.2,
    },

    // Planets with their own machines.
    { name: "vulcanus-foundry-steel", planet: "vulcanus", machine: "foundry", recipe: "casting-steel", item: "steel-plate" },
    { name: "fulgora-em-plant-supercapacitor", planet: "fulgora", machine: "electromagnetic-plant", recipe: "supercapacitor", item: "supercapacitor" },
    { name: "gleba-biochamber-mash", planet: "gleba", machine: "biochamber", recipe: "yumako-processing", item: "yumako-mash", fuel: "nutrients" },
    { name: "aquilo-assembler-heated", planet: "aquilo", machine: "assembling-machine-3", ...gears },

    // Many mechanics at once.
    {
        // Legendary foundry with legendary productivity modules and beacons, and research.
        name: "vulcanus-legendary-foundry-lds", planet: "vulcanus", machine: "foundry", machine_quality: "legendary",
        recipe: "casting-low-density-structure", item: "low-density-structure",
        modules: times(4, "productivity-module-3"), module_quality: "legendary",
        beacons: { count: 4, modules: ["speed-module-3", "speed-module-3"], quality: "legendary" },
        research: { technology: "low-density-structure-productivity", level: 10 },
    },
    {
        // Legendary quality modules in an epic electromagnetic plant, with rare beacons whose speed modules lower the quality.
        name: "fulgora-quality-supercapacitor", planet: "fulgora", machine: "electromagnetic-plant", machine_quality: "epic",
        recipe: "supercapacitor", item: "supercapacitor", modules: times(5, "quality-module-3"), module_quality: "legendary",
        beacons: { count: 2, modules: ["speed-module-3", "speed-module-3"], quality: "rare" }, qualities: true, window: 108000,
    },
    {
        // Quantum processors on Aquilo: low pressure, heating, fluids in and out, epic modules and beacons.
        name: "aquilo-quantum-processor", planet: "aquilo", machine: "electromagnetic-plant", machine_quality: "rare",
        recipe: "quantum-processor", item: "quantum-processor", modules: times(5, "productivity-module-3"), module_quality: "epic",
        beacons: { count: 4, modules: ["speed-module-3", "speed-module-3"], quality: "epic" },
    },
    {
        // A legendary biochamber with quality modules, burning nutrients on Gleba.
        name: "gleba-quality-biochamber", planet: "gleba", machine: "biochamber", machine_quality: "legendary",
        recipe: "yumako-processing", item: "yumako-mash", fuel: "nutrients", modules: times(4, "quality-module-3"), module_quality: "rare",
        qualities: true, window: 108000,
    },
]

// Returns the URL fragment that sets up factory in the calculator: one building, its modules,
// beacons, qualities, fuel and research.
function fragmentOf(factory: MachineFactory, groupKey: string): string {
    const settings = [`items=${factory.item}:f:1:${factory.recipe}`, `planet=${factory.planet ?? "nauvis"}`, `buildings=${groupKey}:${factory.machine}`]
    if (factory.modules !== undefined || factory.beacons !== undefined) {
        const beacons = factory.beacons === undefined ? "" : `;${factory.beacons.modules.join(":")}:${factory.beacons.count}`
        settings.push(`modules=${factory.recipe}:${(factory.modules ?? []).join(":")}${beacons}`)
    }
    const qualities = [factory.machine_quality, factory.module_quality, factory.beacons?.quality]
    if (qualities.some(q => q !== undefined)) {
        settings.push(`rq=${factory.recipe}:${qualities.map(q => q ?? "").join(":")}`)
    }
    if (factory.fuel !== undefined) {
        settings.push(`fuel=${factory.fuel}`)
    }
    if (factory.mining_productivity !== undefined) {
        settings.push(`mprod=${factory.mining_productivity * 100}`)
    }
    if (factory.research !== undefined) {
        settings.push(`rprod=${factory.research.technology}:${factory.research.level}`)
    }
    return "#" + settings.join("&")
}

// Runs in the page: the values of one building of the recipe. The whole solution may need more
// crafts, such as the nutrients that a biochamber burns. arg is the recipe key and the counted
// item, separated by a space.
function readMachine(arg: string): Expected | null {
    const [recipeKey = "", itemKey = ""] = arg.split(" ")
    const spec = window.spec
    const recipe = spec.recipes.get(recipeKey)
    const crafts = recipe === undefined ? null : spec.getRecipeRate(recipe)
    const building = recipe === undefined ? null : spec.getBuilding(recipe)
    if (recipe === undefined || crafts === null || building === null) {
        return null
    }

    const prodEffect = spec.getProdEffect(recipe)
    const products: Record<string, number> = {}
    for (const ing of spec.getProducts(recipe)) {
        if (ing.item.base.key === itemKey) {
            const quality = ing.item.quality?.key ?? "normal"
            products[quality] = (products[quality] ?? 0) + crafts.mul(ing.productAmount(prodEffect)).toFloat()
        }
    }
    const heat = spec.getEnergyIngredients(recipe).find(ing => ing.item.key === "heat")
    return {
        products,
        power: spec.getPowerUsage(recipe, crafts).power.toFloat(),
        drain: building.drain().toFloat(),
        // Heat is in MJ.
        heat: heat === undefined ? 0 : crafts.mul(heat.amount).toFloat() * 1e6,
        burner: building.fuel !== null,
    }
}

// Compares the products of every quality. Quality is random, so the tolerance grows with the
// expected count, like the standard deviation of a count.
function compareQualities(measured: Measured, expected: Readonly<Record<string, number>>, seconds: number): Comparison[] {
    const qualities = new Set([...Object.keys(expected), ...Object.keys(measured).filter(k => k.startsWith("quality_")).map(k => k.slice("quality_".length))])
    return Array.from(qualities, quality => {
        const count = (expected[quality] ?? 0) * seconds
        return absolute(`${quality} products`, measured[`quality_${quality}`] ?? 0, count, 4 * Math.sqrt(count) + PRODUCT_TOLERANCE)
    })
}

/** Single machines. */
export const machines: IngameTest<MachineFactory> = {
    module: "machines",
    factories: FACTORIES,

    async compare(factory: MachineFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        const fragment = fragmentOf(factory, await calculator.groupKey(factory.recipe))
        const expected = await calculator.evaluate(fragment, readMachine, `${factory.recipe} ${factory.item}`)
        const seconds = counter(measured, "seconds")

        const comparisons: Comparison[] = []
        if (!factory.idle) {
            const products = Object.values(expected.products).reduce((sum, rate) => sum + rate, 0)
            comparisons.push(absolute("products", counter(measured, "products"), products * seconds, PRODUCT_TOLERANCE))
        }
        if (factory.qualities) {
            comparisons.push(...compareQualities(measured, expected.products, seconds))
        }
        if (expected.burner) {
            comparisons.push(relative("fuel energy (J)", counter(measured, "fuel_energy"), expected.power * seconds, ENERGY_TOLERANCE))
        } else if (factory.beacons === undefined) {
            // Beacons share the electric network of the machine, and the calculator leaves their power out.
            const power = factory.idle ? expected.drain : expected.power
            comparisons.push(relative("electric energy (J)", counter(measured, "electric_energy"), power * seconds, ENERGY_TOLERANCE))
        }
        if (expected.heat > 0 || measured["heat"] !== undefined) {
            comparisons.push(relative("heat (J)", measured["heat"] ?? 0, expected.heat * seconds, ENERGY_TOLERANCE))
        }
        return { fragment, comparisons }
    },
}

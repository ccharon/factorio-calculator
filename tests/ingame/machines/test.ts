// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Single machines on Nauvis: crafting speed, modules, beacons, research, fuel and electricity.
// build.lua in this directory builds them.

import { type Calculator } from "../framework/calculator.ts"
import { type Comparison, type FactoryData, type FactoryResult, type IngameTest, type Measured, WINDOW_SECONDS, absolute, counter, relative } from "../framework/test.ts"

/** Beacons around the machine of a factory. */
interface Beacons {
    /** Number of beacons, from 1 to 4. */
    readonly count: number
    /** The modules in each beacon. */
    readonly modules: readonly string[]
}

/** One machine that crafts one recipe without interruption, or a mining drill on an ore patch. */
interface MachineFactory extends FactoryData {
    /** Entity key of the machine. */
    readonly machine: string
    /** Recipe key. For a mining drill the key of the resource, which is also its recipe in the calculator. */
    readonly recipe: string
    /** The product that the test counts. */
    readonly item: string
    readonly modules?: readonly string[]
    readonly beacons?: Beacons
    /** The item a burner machine burns. */
    readonly fuel?: string
    /** Resource entity under a mining drill. */
    readonly resource?: string
    /** Mining productivity bonus, such as 0.5 for +50%. */
    readonly mining_productivity?: number
    /** A recipe productivity technology and its researched level. */
    readonly research?: { readonly technology: string, readonly level: number }
    /** True if the machine gets no ingredients, so that only its idle drain counts. */
    readonly idle?: boolean
}

/** What the calculator computes for one machine. */
interface Expected {
    /** Products per second. */
    readonly rate: number
    /** Power in W: burner fuel or electricity including the idle drain. */
    readonly power: number
    /** Idle drain in W. */
    readonly drain: number
    readonly burner: boolean
}

// A window can cut one craft at each end, and a craft with productivity can finish one product more.
const PRODUCT_TOLERANCE = 3
// Energy buffers of the machines make the measured energy differ slightly.
const ENERGY_TOLERANCE = 0.005

const gears = { recipe: "iron-gear-wheel", item: "iron-gear-wheel" }
const speedBeacons = (count: number): Beacons => ({ count, modules: ["speed-module-3", "speed-module-3"] })
const four = (module: string): string[] => Array.from({ length: 4 }, () => module)

const FACTORIES: readonly MachineFactory[] = [
    { name: "assembler-1-gears", machine: "assembling-machine-1", ...gears },
    { name: "assembler-2-gears", machine: "assembling-machine-2", ...gears },
    { name: "assembler-3-gears", machine: "assembling-machine-3", ...gears },
    { name: "assembler-3-productivity", machine: "assembling-machine-3", ...gears, modules: four("productivity-module-3") },
    { name: "assembler-3-speed", machine: "assembling-machine-3", ...gears, modules: four("speed-module-3") },
    { name: "assembler-3-efficiency", machine: "assembling-machine-3", ...gears, modules: four("efficiency-module-3") },
    { name: "assembler-3-idle", machine: "assembling-machine-3", ...gears, idle: true },
    { name: "assembler-3-1-beacon", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(1) },
    { name: "assembler-3-2-beacons", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(2) },
    { name: "assembler-3-4-beacons", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(4) },
    { name: "stone-furnace-coal", machine: "stone-furnace", recipe: "iron-plate", item: "iron-plate", fuel: "coal" },
    {
        name: "electric-furnace-steel-cap", machine: "electric-furnace", recipe: "steel-plate", item: "steel-plate",
        modules: ["productivity-module-3", "productivity-module-3"], research: { technology: "steel-plate-productivity", level: 30 },
    },
    {
        name: "electric-drill-iron-ore", machine: "electric-mining-drill", recipe: "iron-ore", item: "iron-ore",
        resource: "iron-ore", mining_productivity: 0.5,
    },
]

// Returns the URL fragment that sets up factory in the calculator: one building, its modules,
// beacons, fuel and research.
function fragmentOf(factory: MachineFactory, groupKey: string): string {
    const settings = [`items=${factory.item}:f:1:${factory.recipe}`, "planet=nauvis", `buildings=${groupKey}:${factory.machine}`]
    if (factory.modules !== undefined || factory.beacons !== undefined) {
        const beacons = factory.beacons === undefined ? "" : `;${factory.beacons.modules.join(":")}:${factory.beacons.count}`
        settings.push(`modules=${factory.recipe}:${(factory.modules ?? []).join(":")}${beacons}`)
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

// Runs in the page: the rate, power and drain of the building of the only build target.
function readMachine(recipeKey: string): Expected | null {
    const spec = window.spec
    const recipe = spec.recipes.get(recipeKey)
    const target = spec.buildTargets[0]
    const crafts = recipe === undefined ? undefined : spec.lastTotals?.rates.get(recipe)
    const building = recipe === undefined ? null : spec.getBuilding(recipe)
    if (recipe === undefined || target === undefined || crafts === undefined || building === null) {
        return null
    }
    return {
        rate: target.getRate().toFloat(),
        power: spec.getPowerUsage(recipe, crafts).power.toFloat(),
        drain: building.drain().toFloat(),
        burner: building.fuel !== null,
    }
}

/** Single machines. */
export const machines: IngameTest<MachineFactory> = {
    module: "machines",
    factories: FACTORIES,

    async compare(factory: MachineFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        const fragment = fragmentOf(factory, await calculator.groupKey(factory.recipe))
        const expected = await calculator.evaluate(fragment, readMachine, factory.recipe)

        const comparisons: Comparison[] = []
        if (!factory.idle) {
            comparisons.push(absolute("products", counter(measured, "products"), expected.rate * WINDOW_SECONDS, PRODUCT_TOLERANCE))
        }
        if (expected.burner) {
            comparisons.push(relative("fuel energy (J)", counter(measured, "fuel_energy"), expected.power * WINDOW_SECONDS, ENERGY_TOLERANCE))
        } else if (factory.beacons === undefined) {
            // Beacons share the electric network of the machine, and the calculator leaves their power out.
            const power = factory.idle ? expected.drain : expected.power
            comparisons.push(relative("electric energy (J)", counter(measured, "electric_energy"), power * WINDOW_SECONDS, ENERGY_TOLERANCE))
        }
        return { fragment, comparisons }
    },
}

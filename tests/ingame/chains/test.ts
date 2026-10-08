// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Whole production chains as the solver plans them. For each scenario the calculator solves a URL
// fragment, and build.lua in this directory builds every recipe of the solution with its building
// count rounded up, its modules and beacons. The script moves items between the machines through
// one pool per item, supplies the raw items without limit and takes the target items at the target
// rate. The test compares the item flows, raw consumption, surplus, fuel and electricity.

import { type Calculator } from "../framework/calculator.ts"
import { type Comparison, type FactoryData, type FactoryResult, type IngameTest, type Measured, counter, relative } from "../framework/test.ts"

/** An item of some quality, as the game names it. */
interface ItemStack {
    readonly name: string
    readonly quality: string
}

/** The machines of one recipe in the solution. */
interface ChainMachine {
    /** Recipe key in the game, without quality. */
    readonly recipe: string
    /** Quality of the solid ingredients, for recipe variants. */
    readonly recipe_quality: string
    readonly machine: string
    readonly machine_quality: string
    /** Number of machines: the building count of the solution, rounded up. */
    readonly count: number
    readonly modules: readonly string[]
    readonly module_quality: string
    readonly beacons?: { readonly count: number, readonly modules: readonly string[], readonly quality: string }
    /** Fuel item of burner machines. */
    readonly fuel?: string
    /** Resource entity under a mining drill. */
    readonly resource?: string
    /** Fluid that a mining drill needs for the resource. */
    readonly fluid?: string
    /** Solid ingredients per craft. */
    readonly ingredients: readonly (ItemStack & { readonly amount: number })[]
}

/** An item flow per second. key is the item name and quality joined with "@". */
interface Flow extends ItemStack {
    readonly key: string
    readonly rate: number
}

/** What the solver plans for one scenario. */
interface Solution {
    readonly machines: readonly ChainMachine[]
    /** Items supplied from outside, with the rate the solution consumes. */
    readonly raw: readonly Flow[]
    /** Target items, which the script takes at their rate. */
    readonly targets: readonly Flow[]
    /** Items the machines produce, with the solution's rate. */
    readonly produced: readonly Flow[]
    readonly surplus: readonly Flow[]
    /** Electric power of the machines in W. */
    readonly power: number
    /** Fuel power of burner machines in W. */
    readonly fuelPower: number
}

/** A chain scenario: its calculator settings, and the solution once prepare() has solved it. */
interface ChainFactory extends FactoryData {
    readonly fragment: string
    /** The building for the recipes of the same building group as the recipe key. */
    readonly buildings?: Readonly<Record<string, string>>
    readonly solution?: Solution
    /** Why the solution cannot be built, such as a fluid between machines. */
    readonly error?: string
}

// Pools and machine buffers hold items at both ends of the window, and random results such as
// recycling vary, so flows may differ by this share and a few items.
const FLOW_TOLERANCE = 0.03
const ITEM_TOLERANCE = 20
// Spare machines finish the crafts in their buffers before they wait, so the energy can differ a bit more.
const ENERGY_TOLERANCE = 0.03

const SCENARIOS: readonly ChainFactory[] = [
    {
        // Green circuits from ore: drills, stone furnaces that burn coal from coal drills, assemblers.
        name: "chain-green-circuits", warmup: 3600,
        fragment: "#items=electronic-circuit:f:3&planet=nauvis",
        buildings: { "electronic-circuit": "assembling-machine-2", "iron-plate": "stone-furnace" },
    },
    {
        // Red circuits from ore with productivity modules and speed beacons in every assembler.
        // Plastic comes from outside, because oil processing would need fluids between machines.
        name: "chain-red-circuits", warmup: 3600,
        fragment: "#items=advanced-circuit:f:2&planet=nauvis&ignore=plastic-bar&dm=productivity-module-3&db=speed-module-3:speed-module-3&dbc=2",
        buildings: { "advanced-circuit": "assembling-machine-3", "electronic-circuit": "assembling-machine-3" },
    },
    {
        // Bioflux on Gleba from yumako and jellynut that come from outside. The biochambers burn nutrients.
        name: "chain-gleba-bioflux", planet: "gleba", warmup: 3600,
        fragment: "#items=bioflux:f:2&planet=gleba&ignore=yumako,jellynut",
    },
    {
        // Uncommon gears from ore with quality modules in drills, furnaces and assemblers. Every
        // step raises some items, so the chain runs recipe variants for several qualities, and the
        // gears that are not uncommon leave as surplus. Recycling loops are left out: with pools
        // that make machines wait, recyclers and assemblers block each other.
        name: "chain-uncommon-gears", warmup: 7200, window: 72000,
        fragment: "#items=iron-gear-wheel@uncommon:r:60&planet=nauvis&dm=quality-module-3",
        buildings: { "iron-gear-wheel": "assembling-machine-3" },
    },
]

// Runs in the page: the solution of the loaded fragment as machines and item flows.
function readSolution(): Solution | null {
    const spec = window.spec
    const totals = spec.lastTotals
    if (totals === null) {
        return null
    }
    const keyOf = (item: { readonly key: string, readonly base: { readonly key: string }, readonly quality: { readonly key: string } | null }): Flow => ({
        key: item.key.includes("@") ? item.key : `${item.key}@normal`,
        name: item.base.key,
        quality: item.quality?.key ?? "normal",
        rate: 0,
    })

    const machines: ChainMachine[] = []
    let power = 0
    let fuelPower = 0
    const built = new Set<unknown>()
    for (const [node, rate] of totals.rates) {
        // Game recipes are the nodes that the calculator finds by their key. The others are the
        // solver's output and surplus nodes and the pseudo-recipes of supplied items.
        const variant = "key" in node && typeof node.key === "string" ? spec.findRecipe(node.key) : undefined
        if (variant === undefined || variant !== node) {
            continue
        }
        // Resources without building, such as an ignored item, come from outside.
        const building = spec.getBuilding(variant)
        if (building === null) {
            if (variant.isResource()) {
                continue
            }
            throw new Error(`recipe ${variant.key} has no building`)
        }
        // A mining recipe has the key of its resource and may need a fluid.
        const mining = "miningTime" in variant
        const miningFluid = mining ? variant.ingredients.find(ing => ing.item.phase === "fluid")?.item.key : undefined
        built.add(variant)
        const moduleSpec = spec.getModuleSpec(variant)
        const beaconModules = moduleSpec?.beaconModules.filter(m => m !== null).map(m => m.key) ?? []
        const beaconCount = moduleSpec?.beaconCount.toFloat() ?? 0
        const usage = spec.getPowerUsage(variant, rate)
        if (usage.fuel === "electric") {
            power += usage.power.toFloat()
        } else if (usage.fuel !== null) {
            fuelPower += usage.power.toFloat()
        }
        machines.push({
            recipe: variant.base.key,
            recipe_quality: variant.quality?.key ?? "normal",
            machine: building.key,
            machine_quality: spec.getQuality(variant, "machine").key,
            count: Math.ceil(spec.getCount(variant, rate).toFloat() - 1e-9),
            modules: moduleSpec?.modules.filter(m => m !== null).map(m => m.key) ?? [],
            module_quality: spec.getQuality(variant, "module").key,
            beacons: beaconCount > 0 && beaconModules.length > 0
                ? { count: beaconCount, modules: beaconModules, quality: spec.getQuality(variant, "beacon").key }
                : undefined,
            fuel: building.fuel === null ? undefined : spec.fuel.get(building.fuel).key,
            resource: mining ? variant.key : undefined,
            fluid: miningFluid,
            ingredients: variant.ingredients.filter(ing => ing.item.phase === "solid").map(ing => ({ ...keyOf(ing.item), amount: ing.amount.toFloat() })),
        })
    }

    // The script cannot move fluids between machines, so fluids must come from outside.
    const fluidProducts = new Set(machines.flatMap(m => spec.findRecipe(m.recipe)?.products.filter(ing => ing.item.phase === "fluid").map(ing => ing.item.key) ?? []))
    for (const m of machines) {
        const fluid = spec.findRecipe(m.recipe)?.ingredients.find(ing => fluidProducts.has(ing.item.key))
        if (fluid !== undefined) {
            throw new Error(`${m.recipe} needs ${fluid.item.key} from another recipe of the chain; ignore it or disable that recipe`)
        }
    }

    const produced: Flow[] = []
    const raw: Flow[] = []
    for (const [item, producers] of totals.producers) {
        let rate = 0
        for (const [recipe, itemRate] of producers) {
            if (built.has(recipe)) {
                rate += itemRate.toFloat()
            }
        }
        if (rate > 0 && item.phase === "solid") {
            produced.push({ ...keyOf(item), rate })
        }
    }
    // Raw items come from the producers that are not built, such as the pseudo-recipe of an ignored item.
    for (const [item, producers] of totals.producers) {
        let rate = 0
        let supplied = false
        for (const [recipe, itemRate] of producers) {
            if (!built.has(recipe)) {
                rate += itemRate.toFloat()
                supplied = true
            }
        }
        if (supplied && item.phase === "solid") {
            raw.push({ ...keyOf(item), rate })
        }
    }
    const targets = Array.from(totals.products, ([item, rate]) => ({ ...keyOf(item), rate: rate.toFloat() }))
    const surplus = Array.from(totals.surplus, ([item, rate]) => ({ ...keyOf(item), rate: rate.toFloat() }))
    return { machines, raw, targets, produced, surplus, power, fuelPower }
}

// Compares one flow: the measured count of counter against rate over the window.
function flow(label: string, measured: Measured, name: string, rate: number, seconds: number): Comparison {
    const expected = rate * seconds
    const game = measured[name] ?? 0
    return { label, game, calculator: expected, ok: Math.abs(game - expected) <= expected * FLOW_TOLERANCE + ITEM_TOLERANCE }
}

/** Production chains from solver results. */
export const chains: IngameTest<ChainFactory> = {
    module: "chains",
    factories: SCENARIOS,

    async prepare(calculator: Calculator): Promise<readonly ChainFactory[]> {
        const prepared: ChainFactory[] = []
        for (const scenario of SCENARIOS) {
            const buildings = await Promise.all(Object.entries(scenario.buildings ?? {}).map(async ([recipe, building]) => `${await calculator.groupKey(recipe)}:${building}`))
            const fragment = buildings.length === 0 ? scenario.fragment : `${scenario.fragment}&buildings=${buildings.join(",")}`
            try {
                prepared.push({ ...scenario, fragment, solution: await calculator.evaluate(fragment, readSolution, "") })
            } catch (error) {
                prepared.push({ ...scenario, fragment, error: error instanceof Error ? error.message.split("\n")[0] : String(error) })
            }
        }
        return prepared
    },

    compare(factory: ChainFactory, measured: Measured): Promise<FactoryResult> {
        const solution = factory.solution
        if (solution === undefined) {
            const error = { label: `not built: ${factory.error ?? "no solution"}`, game: 0, calculator: 0, ok: false }
            return Promise.resolve({ fragment: factory.fragment, comparisons: [error] })
        }
        const seconds = counter(measured, "seconds")
        const comparisons: Comparison[] = [
            ...solution.targets.map(t => flow(`target ${t.key}`, measured, `delivered:${t.key}`, t.rate, seconds)),
            ...solution.produced.map(p => flow(`produced ${p.key}`, measured, `produced:${p.key}`, p.rate, seconds)),
            ...solution.raw.map(r => flow(`raw ${r.key}`, measured, `consumed:${r.key}`, r.rate, seconds)),
            ...solution.surplus.map(s => flow(`surplus ${s.key}`, measured, `surplus:${s.key}`, s.rate, seconds)),
        ]
        if (solution.power > 0) {
            comparisons.push(relative("electric energy (J)", counter(measured, "electric_energy"), solution.power * seconds, ENERGY_TOLERANCE))
        }
        if (solution.fuelPower > 0) {
            comparisons.push(relative("fuel energy (J)", counter(measured, "fuel_energy"), solution.fuelPower * seconds, ENERGY_TOLERANCE))
        }
        return Promise.resolve({ fragment: factory.fragment, comparisons })
    },
}

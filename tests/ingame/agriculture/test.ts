// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Agricultural towers that plant and harvest without interruption, several per factory. build.lua
// in this directory builds them.

import { type Calculator } from "../framework/calculator.ts"
import { type FactoryData, type FactoryResult, type IngameTest, type Measured, absolute, counter, relative } from "../framework/test.ts"

/** An agricultural tower with one plant. Its recipe in the calculator has the key of the plant. */
interface PlantFactory extends FactoryData {
    readonly planet: string
    readonly machine: string
    readonly plant: string
    readonly seed: string
    /** Tile that the plant grows on. */
    readonly soil: string
    /** The harvested item. */
    readonly item: string
    /** Items of one harvest. */
    readonly harvest: number
    /** Towers of the factory, whose sum the test compares. */
    readonly towers: number
}

/** What the calculator computes for one tower. */
interface Expected {
    /** Harvested items per second. */
    readonly rate: number
    /** Electric power in W. */
    readonly power: number
}

// The window cuts the harvests of up to one plant at each end.
const HARVEST_TOLERANCE = 2
// The crane path depends on random planting spots. The towers of a factory average them out to
// about 2% around the average of the dataset.
const ENERGY_TOLERANCE = 0.03

// Plants grow for growth time before the first harvest, and the tower plants one at a time. The
// warmup of two growth times reaches the steady state, and the window holds six harvests per plot.
function timing(growthTicks: number): Pick<FactoryData, "warmup" | "window"> {
    return { warmup: 2 * growthTicks, window: 6 * growthTicks }
}

const tower = { machine: "agricultural-tower", towers: 8 }

const FACTORIES: readonly PlantFactory[] = [
    {
        name: "gleba-yumako", planet: "gleba", ...tower, plant: "yumako-tree", seed: "yumako-seed", soil: "artificial-yumako-soil",
        item: "yumako", harvest: 50, ...timing(18000),
    },
    {
        name: "gleba-jellystem", planet: "gleba", ...tower, plant: "jellystem", seed: "jellynut-seed", soil: "artificial-jellynut-soil",
        item: "jellynut", harvest: 50, ...timing(18000),
    },
    {
        name: "nauvis-tree", planet: "nauvis", ...tower, plant: "tree-plant", seed: "tree-seed", soil: "grass-1",
        item: "wood", harvest: 4, ...timing(36000),
    },
]

// Runs in the page: harvest rate and power of one tower. arg is the plant key and the harvested item.
function readTower(arg: string): Expected | null {
    const [plantKey = "", itemKey = ""] = arg.split(" ")
    const spec = window.spec
    const recipe = spec.recipes.get(plantKey)
    const crafts = recipe === undefined ? null : spec.getRecipeRate(recipe)
    const product = recipe?.products.find(ing => ing.item.key === itemKey)
    if (recipe === undefined || crafts === null || product === undefined) {
        return null
    }
    return {
        rate: crafts.mul(product.productAmount(spec.getProdEffect(recipe))).toFloat(),
        power: spec.getPowerUsage(recipe, crafts).power.toFloat(),
    }
}

/** Agricultural towers. */
export const agriculture: IngameTest<PlantFactory> = {
    module: "agriculture",
    factories: FACTORIES,

    async compare(factory: PlantFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        const groupKey = await calculator.groupKey(factory.plant)
        const fragment = `#items=${factory.item}:f:1:${factory.plant}&planet=${factory.planet}&buildings=${groupKey}:${factory.machine}`
        const expected = await calculator.evaluate(fragment, readTower, `${factory.plant} ${factory.item}`)
        const seconds = counter(measured, "seconds")
        const towers = factory.towers
        return {
            fragment,
            comparisons: [
                absolute("harvest", counter(measured, "products"), expected.rate * seconds * towers, HARVEST_TOLERANCE * towers * factory.harvest),
                relative("electric energy (J)", counter(measured, "electric_energy"), expected.power * seconds * towers, ENERGY_TOLERANCE),
            ],
        }
    },
}

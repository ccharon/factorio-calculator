// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Steam power: a boiler with steam engines, and a heat exchanger with steam turbines. build.lua in
// this directory builds them.

import { type Calculator } from "../framework/calculator.ts"
import { type Comparison, type FactoryData, type FactoryResult, type IngameTest, type Measured, absolute, counter, relative } from "../framework/test.ts"

/** A boiler or heat exchanger that feeds a chain of steam engines or turbines, which run at full load. */
interface SteamFactory extends FactoryData {
    readonly boiler: string
    /** Recipe of the boiler in the calculator: steam, or hot steam such as steam-500. */
    readonly recipe: string
    /** Fuel of a boiler. A heat exchanger gets heat instead. */
    readonly fuel?: string
    readonly engine: string
    /** Number of engines in the game. The test checks that the calculator needs the same number. */
    readonly engines: number
}

/** What the calculator computes for one boiler and the engines its steam runs. */
interface Expected {
    /** Fuel power of a boiler in W. */
    readonly fuelPower: number
    /** Heat that a heat exchanger takes in W. */
    readonly heat: number
    /** Electric power of the engines in W. */
    readonly electricPower: number
    /** Engines that the steam of one boiler runs. */
    readonly engines: number
}

// Energy buffers of the boiler and the engines make the measured energy differ slightly.
const ENERGY_TOLERANCE = 0.005

const FACTORIES: readonly SteamFactory[] = [
    { name: "boiler-steam-engines", boiler: "boiler", recipe: "steam", fuel: "coal", engine: "steam-engine", engines: 2 },
    { name: "heat-exchanger-turbines", boiler: "heat-exchanger", recipe: "steam-500", engine: "steam-turbine", engines: 2 },
]

// Runs in the page: one boiler and the engines that burn its steam. arg is the boiler recipe and
// the generator recipe, separated by a space.
function readSteam(arg: string): Expected | null {
    const [boilerKey = "", generatorKey = ""] = arg.split(" ")
    const spec = window.spec
    const boiler = spec.recipes.get(boilerKey)
    const generator = spec.recipes.get(generatorKey)
    const crafts = boiler === undefined ? null : spec.getRecipeRate(boiler)
    const steamOut = boiler?.products[0]?.amount
    const steamIn = generator?.ingredients[0]?.amount
    const electricityOut = generator?.products[0]?.amount
    if (boiler === undefined || generator === undefined || crafts === null || steamOut === undefined || steamIn === undefined || electricityOut === undefined) {
        return null
    }
    // Electricity and heat are in MJ.
    const heat = boiler.ingredients.find(ing => ing.item.key === "heat")
    const generatorCrafts = crafts.mul(steamOut).div(steamIn)
    return {
        fuelPower: spec.getPowerUsage(boiler, crafts).power.toFloat(),
        heat: heat === undefined ? 0 : crafts.mul(heat.amount).toFloat() * 1e6,
        electricPower: generatorCrafts.mul(electricityOut).toFloat() * 1e6,
        engines: spec.getCount(generator, generatorCrafts).toFloat(),
    }
}

/** Steam power. */
export const steam: IngameTest<SteamFactory> = {
    module: "steam",
    factories: FACTORIES,

    async compare(factory: SteamFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        const groupKey = await calculator.groupKey(factory.recipe)
        const fuel = factory.fuel === undefined ? "" : `&fuel=${factory.fuel}`
        const fragment = `#items=${factory.recipe}:f:1:${factory.recipe}&planet=nauvis&buildings=${groupKey}:${factory.boiler}${fuel}`
        const expected = await calculator.evaluate(fragment, readSteam, `${factory.recipe} ${factory.engine}-power`)
        const seconds = counter(measured, "seconds")

        const comparisons: Comparison[] = []
        if (factory.fuel !== undefined) {
            comparisons.push(relative("boiler fuel energy (J)", counter(measured, "fuel_energy"), expected.fuelPower * seconds, ENERGY_TOLERANCE))
        } else {
            comparisons.push(relative("heat (J)", counter(measured, "heat"), expected.heat * seconds, ENERGY_TOLERANCE))
        }
        comparisons.push(
            relative("engine electric energy (J)", counter(measured, "electric_energy"), expected.electricPower * seconds, ENERGY_TOLERANCE),
            absolute("engines", factory.engines, Math.ceil(expected.engines), 0),
        )
        return { fragment, comparisons }
    },
}

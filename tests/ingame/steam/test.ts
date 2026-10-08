// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Steam power: a boiler with steam engines. build.lua in this directory builds it.

import { type Calculator } from "../framework/calculator.ts"
import { type FactoryData, type FactoryResult, type IngameTest, type Measured, absolute, counter, relative } from "../framework/test.ts"

/** A boiler that burns fuel and feeds a chain of steam engines, which run at full load. */
interface SteamFactory extends FactoryData {
    readonly boiler: string
    readonly fuel: string
    readonly engine: string
    /** Number of engines in the game. The test checks that the calculator needs the same number. */
    readonly engines: number
}

/** What the calculator computes for one boiler and the engines its steam runs. */
interface Expected {
    /** Fuel power of the boiler in W. */
    readonly fuelPower: number
    /** Electric power of the engines in W. */
    readonly electricPower: number
    /** Engines that the steam of one boiler runs. */
    readonly engines: number
}

// Energy buffers of the boiler and the engines make the measured energy differ slightly.
const ENERGY_TOLERANCE = 0.005

const FACTORIES: readonly SteamFactory[] = [
    { name: "boiler-steam-engines", boiler: "boiler", fuel: "coal", engine: "steam-engine", engines: 2 },
]

// Runs in the page: the fuel power of one boiler and the power of the engines that burn its steam.
function readSteam(generatorKey: string): Expected | null {
    const spec = window.spec
    const steam = spec.recipes.get("steam")
    const generator = spec.recipes.get(generatorKey)
    const target = spec.buildTargets[0]
    const crafts = steam === undefined ? undefined : spec.lastTotals?.rates.get(steam)
    const steamIn = generator?.ingredients[0]?.amount
    const electricityOut = generator?.products[0]?.amount
    if (steam === undefined || generator === undefined || target === undefined || crafts === undefined || steamIn === undefined || electricityOut === undefined) {
        return null
    }
    const steamRate = target.getRate()
    // The generator recipe turns steam into electricity in MJ.
    const generatorCrafts = steamRate.div(steamIn)
    return {
        fuelPower: spec.getPowerUsage(steam, crafts).power.toFloat(),
        electricPower: generatorCrafts.mul(electricityOut).toFloat() * 1e6,
        engines: spec.getCount(generator, generatorCrafts).toFloat(),
    }
}

/** Steam power. */
export const steam: IngameTest<SteamFactory> = {
    module: "steam",
    factories: FACTORIES,

    async compare(factory: SteamFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        const groupKey = await calculator.groupKey("steam")
        const fragment = `#items=steam:f:1&planet=nauvis&buildings=${groupKey}:${factory.boiler}&fuel=${factory.fuel}`
        const expected = await calculator.evaluate(fragment, readSteam, `${factory.engine}-power`)
        return {
            fragment,
            comparisons: [
                relative("boiler fuel energy (J)", counter(measured, "fuel_energy"), expected.fuelPower * counter(measured, "seconds"), ENERGY_TOLERANCE),
                relative("engine electric energy (J)", counter(measured, "electric_energy"), expected.electricPower * counter(measured, "seconds"), ENERGY_TOLERANCE),
                absolute("steam engines", factory.engines, expected.engines, 0),
            ],
        }
    },
}

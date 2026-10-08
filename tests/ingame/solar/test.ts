// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Solar panels over one full day on every planet. build.lua in this directory builds them.

import { type Calculator } from "../framework/calculator.ts"
import { type FactoryData, type FactoryResult, type IngameTest, type Measured, counter, relative } from "../framework/test.ts"

/** A solar panel on a planet. window is the length of the planet's day in ticks. */
interface SolarFactory extends FactoryData {
    readonly planet: string
    readonly machine: string
    readonly window: number
}

// The day starts at the same time of day as it ends, so only the energy buffer of the panel
// makes the measured energy differ.
const ENERGY_TOLERANCE = 0.005

// Day lengths in ticks, from the day-night-cycle surface property of the planets.
const DAYS: Readonly<Record<string, number>> = {
    nauvis: 25200,
    vulcanus: 5400,
    gleba: 36000,
    fulgora: 10800,
    aquilo: 72000,
}

const FACTORIES: readonly SolarFactory[] = Object.entries(DAYS).map(([planet, window]) => ({ name: `solar-panel-${planet}`, planet, machine: "solar-panel", window }))

// Runs in the page: electric power in W of the only build target, one solar panel.
function readPower(): number | null {
    // Electricity is in MJ.
    const rate = window.spec.buildTargets[0]?.getRate().toFloat()
    return rate === undefined ? null : rate * 1e6
}

/** Solar panels. */
export const solar: IngameTest<SolarFactory> = {
    module: "solar",
    factories: FACTORIES,

    async compare(factory: SolarFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        const recipe = `${factory.machine}-${factory.planet}`
        const fragment = `#items=electricity:f:1:${recipe}&planet=${factory.planet}&enable=${recipe}`
        const power = await calculator.evaluate(fragment, readPower, "")
        return {
            fragment,
            comparisons: [relative("electric energy (J)", counter(measured, "electric_energy"), power * counter(measured, "seconds"), ENERGY_TOLERANCE)],
        }
    },
}

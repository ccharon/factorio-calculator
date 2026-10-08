// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Rocket silos that launch every rocket as soon as it is ready: launches and the average time between two launches.
// build.lua in this directory builds them.

import { type Calculator } from "../framework/calculator.ts"
import { type Beacons, type FactoryData, type FactoryResult, type IngameTest, type Measured, absolute, counter, relative } from "../framework/test.ts"

/** A rocket silo with its modules, beacons and research. */
interface RocketFactory extends FactoryData {
    readonly machine: string
    readonly machine_quality?: string
    readonly modules?: readonly string[]
    readonly module_quality?: string
    readonly beacons?: Beacons
    /** A recipe productivity technology and its researched level. */
    readonly research?: { readonly technology: string, readonly level: number }
}

// Launches that alternate between two intervals make the average over an odd count of intervals
// differ from the long-run average by up to half their difference divided by the count.
const CYCLE_TOLERANCE = 0.01
// Rocket parts in one rocket.
const PARTS_PER_LAUNCH = 50
const TICKS_PER_SECOND = 60

const times = (count: number, module: string): string[] => Array.from({ length: count }, () => module)

const FACTORIES: readonly RocketFactory[] = [
    { name: "rocket-silo", machine: "rocket-silo", window: 54000 },
    {
        // Parts take less time than a launch, so the launch limits the rate if the silo waits for it.
        name: "rocket-silo-fast", machine: "rocket-silo", window: 54000,
        modules: times(4, "speed-module-3"), module_quality: "legendary",
        beacons: { count: 4, modules: ["speed-module-3", "speed-module-3"], quality: "legendary" },
    },
    {
        name: "rocket-silo-productivity", machine: "rocket-silo", window: 54000,
        modules: times(4, "productivity-module-3"), research: { technology: "rocket-part-productivity", level: 10 },
    },
    // The parts are ready while the doors close, so the next rocket waits for closed doors.
    { name: "rocket-silo-closing", machine: "rocket-silo", window: 54000, modules: times(4, "speed-module-3"), module_quality: "rare" },
    // One rocket reopens the doors while the lights blink, the next one waits for closed doors.
    { name: "rocket-silo-alternating", machine: "rocket-silo", window: 54000, modules: times(4, "speed-module-3"), module_quality: "epic" },
    { name: "rocket-silo-legendary-fast", machine: "rocket-silo", machine_quality: "legendary", window: 54000, modules: times(4, "speed-module-3"), module_quality: "uncommon" },
    { name: "rocket-silo-legendary-blinking", machine: "rocket-silo", machine_quality: "legendary", window: 54000, modules: times(4, "speed-module-3") },
    // One rocket rises in the open silo, the next one waits for closed doors.
    { name: "rocket-silo-legendary-alternating", machine: "rocket-silo", machine_quality: "legendary", window: 54000, modules: times(2, "speed-module-3"), module_quality: "rare" },
]

function fragmentOf(factory: RocketFactory): string {
    const settings = ["items=rocket-part:f:1", "planet=nauvis"]
    if (factory.modules !== undefined || factory.beacons !== undefined) {
        const beacons = factory.beacons === undefined ? "" : `;${factory.beacons.modules.join(":")}:${factory.beacons.count}`
        settings.push(`modules=rocket-part:${(factory.modules ?? []).join(":")}${beacons}`)
    }
    const qualities = [factory.machine_quality, factory.module_quality, factory.beacons?.quality]
    if (qualities.some(q => q !== undefined)) {
        settings.push(`rq=rocket-part:${qualities.map(q => q ?? "").join(":")}`)
    }
    if (factory.research !== undefined) {
        settings.push(`rprod=${factory.research.technology}:${factory.research.level}`)
    }
    return "#" + settings.join("&")
}

// Runs in the page: rocket parts per second of the only build target, one silo.
function readParts(): number | null {
    return window.spec.buildTargets[0]?.getRate().toFloat() ?? null
}

/** Rocket silos. */
export const rocket: IngameTest<RocketFactory> = {
    module: "rocket",
    factories: FACTORIES,

    async compare(factory: RocketFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        const fragment = fragmentOf(factory)
        const launchRate = await calculator.evaluate(fragment, readParts, "") / PARTS_PER_LAUNCH
        const launches = counter(measured, "launches")
        return {
            fragment,
            comparisons: [
                absolute("launches", launches, launchRate * counter(measured, "seconds"), 1),
                relative("ticks per launch", counter(measured, "interval_ticks") / counter(measured, "intervals"), TICKS_PER_SECOND / launchRate, CYCLE_TOLERANCE),
            ],
        }
    },
}

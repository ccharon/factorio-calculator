// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Rocket silos that launch every rocket as soon as it is ready: rocket part rate and launch rate.
// build.lua in this directory builds them.

import { type Calculator } from "../framework/calculator.ts"
import { type FactoryData, type FactoryResult, type IngameTest, type Measured, absolute, counter } from "../framework/test.ts"

/** Beacons around the silo. Their modules have the module quality of the factory. */
interface Beacons {
    readonly count: number
    readonly modules: readonly string[]
    readonly quality?: string
}

/** A rocket silo with its modules, beacons and research. */
interface RocketFactory extends FactoryData {
    readonly machine: string
    readonly modules?: readonly string[]
    readonly module_quality?: string
    readonly beacons?: Beacons
    /** A recipe productivity technology and its researched level. */
    readonly research?: { readonly technology: string, readonly level: number }
}

// The rocket in progress can be counted with up to one part too many or too few.
const PART_TOLERANCE = 2
// Rocket parts in one rocket.
const PARTS_PER_LAUNCH = 50

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
]

function fragmentOf(factory: RocketFactory): string {
    const settings = ["items=rocket-part:f:1", "planet=nauvis"]
    if (factory.modules !== undefined || factory.beacons !== undefined) {
        const beacons = factory.beacons === undefined ? "" : `;${factory.beacons.modules.join(":")}:${factory.beacons.count}`
        settings.push(`modules=rocket-part:${(factory.modules ?? []).join(":")}${beacons}`)
    }
    if (factory.module_quality !== undefined || factory.beacons?.quality !== undefined) {
        settings.push(`rq=rocket-part::${factory.module_quality ?? ""}:${factory.beacons?.quality ?? ""}`)
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
        const parts = await calculator.evaluate(fragment, readParts, "") * counter(measured, "seconds")
        return {
            fragment,
            comparisons: [
                absolute("rocket parts", counter(measured, "parts"), parts, PART_TOLERANCE),
                absolute("launches", counter(measured, "launches"), parts / PARTS_PER_LAUNCH, 1),
            ],
        }
    },
}

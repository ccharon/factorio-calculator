// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// The factories that tests/ingame/check.ts builds in the game and computes in the calculator.
// tests/ingame/mod/control.lua builds them from this data.

/** Beacons around the machine of a factory. */
export interface Beacons {
    /** Number of beacons, from 1 to 4. */
    readonly count: number
    /** The modules in each beacon. */
    readonly modules: readonly string[]
}

/** One machine on Nauvis that crafts one recipe without interruption. */
export interface Factory {
    /** Unique name, used in the report. */
    readonly name: string
    /** Entity key of the machine. */
    readonly machine: string
    readonly recipe: string
    /** The product that the test counts. */
    readonly item: string
    readonly modules?: readonly string[]
    readonly beacons?: Beacons
    /** The item a burner machine burns. The test then also compares the fuel energy. */
    readonly fuel?: string
}

const gears = { recipe: "iron-gear-wheel", item: "iron-gear-wheel" }
const speedBeacons = (count: number): Beacons => ({ count, modules: ["speed-module-3", "speed-module-3"] })

/** All factories, in the order they are built. */
export const FACTORIES: readonly Factory[] = [
    { name: "assembler-1-gears", machine: "assembling-machine-1", ...gears },
    { name: "assembler-2-gears", machine: "assembling-machine-2", ...gears },
    { name: "assembler-3-gears", machine: "assembling-machine-3", ...gears },
    { name: "assembler-3-productivity", machine: "assembling-machine-3", ...gears, modules: Array.from({ length: 4 }, () => "productivity-module-3") },
    { name: "assembler-3-1-beacon", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(1) },
    { name: "assembler-3-2-beacons", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(2) },
    { name: "assembler-3-4-beacons", machine: "assembling-machine-3", ...gears, beacons: speedBeacons(4) },
    { name: "stone-furnace-coal", machine: "stone-furnace", recipe: "iron-plate", item: "iron-plate", fuel: "coal" },
]

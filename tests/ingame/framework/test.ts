// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// What an in-game test module provides, and the comparisons it reports.

import { TICKS_PER_SECOND } from "../../../src/data/game.ts"
import type { Calculator } from "./calculator.ts"

/** Ticks before the measuring window, so that machines run at full speed and buffers are full. */
export const WARMUP_TICKS = 600
/** Length of the measuring window. */
export const WINDOW_TICKS = 36000
/** Length of the measuring window in seconds. */
export const WINDOW_SECONDS: number = WINDOW_TICKS / TICKS_PER_SECOND

/** The data of one factory, passed to the build.lua of its test module. Names are unique across all tests. */
export interface FactoryData {
    readonly name: string
}

/** The counters of one factory over the measuring window, by name. */
export type Measured = Readonly<Record<string, number>>

/** One value measured in the game and computed by the calculator. */
export interface Comparison {
    readonly label: string
    readonly game: number
    readonly calculator: number
    readonly ok: boolean
}

/** The result of one factory: the calculator settings it used and its comparisons. */
export interface FactoryResult {
    /** URL fragment that shows the factory in the calculator. */
    readonly fragment: string
    readonly comparisons: readonly Comparison[]
}

/**
 * A test module: a directory in tests/ingame with a test.ts that exports it and a build.lua that
 * builds its factories in the game.
 */
export interface IngameTest<F extends FactoryData> {
    /** Directory name of the module. */
    readonly module: string
    readonly factories: readonly F[]
    /** Computes factory in the calculator and compares the result with the measured counters. */
    compare(factory: F, measured: Measured, calculator: Calculator): Promise<FactoryResult>
}

/** Compares counts that may differ by tolerance, such as products cut off at the window ends. */
export function absolute(label: string, game: number, calculator: number, tolerance: number): Comparison {
    return { label, game, calculator, ok: Math.abs(game - calculator) <= tolerance }
}

/** Compares values that may differ by the share tolerance of the calculator value, such as energy in buffers. */
export function relative(label: string, game: number, calculator: number, tolerance: number): Comparison {
    return { label, game, calculator, ok: Math.abs(game - calculator) <= Math.abs(calculator) * tolerance }
}

/** Returns the counter name of measured, or throws if the game did not write it. */
export function counter(measured: Measured, name: string): number {
    const value = measured[name]
    if (value === undefined) {
        throw new Error(`no counter ${name}`)
    }
    return value
}

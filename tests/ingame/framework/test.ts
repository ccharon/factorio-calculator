// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// What an in-game test module provides, and the comparisons it reports.

import type { Calculator } from "./calculator.ts"

/** Ticks before the measuring window, so that machines run at full speed and buffers are full. */
export const WARMUP_TICKS = 600
/** Length of the measuring window. */
export const WINDOW_TICKS = 36000

/** The data of one factory, passed to the build.lua of its test module. Names are unique across all tests. */
export interface FactoryData {
    readonly name: string
    /** Planet whose surface the factory stands on. Without it, a lab surface with default properties. */
    readonly planet?: string
    /** Ticks before the measuring window. Defaults to WARMUP_TICKS. */
    readonly warmup?: number
    /** Length of the measuring window in ticks. Defaults to WINDOW_TICKS. */
    readonly window?: number
}

/** Beacons around the machine of a factory. Their modules have the module quality of the factory. */
export interface Beacons {
    /** Number of beacons, from 1 to 4. */
    readonly count: number
    /** The modules in each beacon. */
    readonly modules: readonly string[]
    readonly quality?: string
}

/** Returns the tick at which the measuring window of factory ends. */
export function finishTick(factory: FactoryData): number {
    return (factory.warmup ?? WARMUP_TICKS) + (factory.window ?? WINDOW_TICKS)
}

/** The counters of one factory over the measuring window, by name, and the window length as seconds. */
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
    /** Returns the factories to build, if they depend on the calculator, such as a solver result. Runs before the game. */
    prepare?(calculator: Calculator): Promise<readonly F[]>
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

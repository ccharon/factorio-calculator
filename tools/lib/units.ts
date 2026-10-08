// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Parsers for the unit strings Factorio uses in prototype data, such as "1.8MW" or "4MJ".

const PREFIXES: ReadonlyMap<string, number> = new Map([
    ["", 1],
    ["k", 1e3],
    ["M", 1e6],
    ["G", 1e9],
    ["T", 1e12],
    ["P", 1e15],
])

/**
 * Parses a Factorio energy or power string into a plain number.
 *
 * @param value - A string like "75kW", "4MJ" or "2kJ", or a number.
 * @param unit - The expected unit letter: "W" for power, "J" for energy.
 * @returns Watts or joules, or undefined if value is undefined.
 */
export function parseEnergy(value: string | number | undefined, unit: "W" | "J"): number | undefined {
    if (value === undefined || typeof value === "number") {
        return value
    }
    const match = /^([0-9.eE+-]+)\s*([kMGTP]?)([WJ])$/.exec(value)
    const prefix = PREFIXES.get(match?.[2] ?? "")
    if (!match || match[3] !== unit || prefix === undefined) {
        throw new Error(`cannot parse ${unit} value: ${value}`)
    }
    return roundFloat(Number(match[1]) * prefix)
}

/**
 * Removes binary floating-point noise from a parsed value, such as 0.30000000000000004.
 *
 * @returns x rounded to 12 significant digits.
 */
export function roundFloat(x: number): number {
    return Number(x.toPrecision(12))
}

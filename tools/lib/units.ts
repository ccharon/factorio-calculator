/*Copyright 2026 Christian Charon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/

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

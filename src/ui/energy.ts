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

// Formatting of power and energy values with SI prefixes.

import { Rational } from "../core/rational.ts"

const thousand = Rational.from_float(1000)

const powerSuffixes = ["\u00A0W", "kW", "MW", "GW", "TW", "PW"] as const
const energySuffixes = ["J", "kJ", "MJ", "GJ", "TJ", "PJ"] as const

/** A value scaled to a unit with SI prefix. */
export interface ScaledValue {
    /** The value in the unit of suffix. */
    power: Rational
    suffix: string
}

function scale(x: Rational, suffixes: readonly string[]): ScaledValue {
    let i = 0
    while (thousand.less(x) && i < suffixes.length - 1) {
        x = x.div(thousand)
        i++
    }
    return { power: x, suffix: suffixes[i] ?? "" }
}

/** Scales a power in W to W, kW, MW and so on. */
export function powerRepr(watts: Rational): ScaledValue {
    return scale(watts, powerSuffixes)
}

/** Formats an energy in J, rounded up to a whole number, such as "4 MJ". */
export function energyString(joules: Rational): string {
    const { power, suffix } = scale(joules, energySuffixes)
    return `${power.toUpDecimal(0)} ${suffix}`
}

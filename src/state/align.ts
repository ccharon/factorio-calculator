/*Copyright 2019 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Number formatting for rates and building counts, with column alignment.

import { Rational, one } from "../core/rational.ts"

/** Time unit of displayed rates: per second, minute or hour. */
export type RateName = "s" | "m" | "h"

/** Displayed number format. */
export type DisplayFormat = "decimal" | "rational"

export const DEFAULT_RATE: RateName = "m"
export const DEFAULT_RATE_PRECISION = 3
export const DEFAULT_COUNT_PRECISION = 1
export const DEFAULT_FORMAT: DisplayFormat = "decimal"

const displayRates: ReadonlyMap<RateName, Rational> = new Map([
    ["s", one],
    ["m", Rational.from_float(60)],
    ["h", Rational.from_float(3600)],
])

export const longRateNames: ReadonlyMap<RateName, string> = new Map([
    ["s", "second"],
    ["m", "minute"],
    ["h", "hour"],
])

/** Returns whether s is a valid rate name. */
export function isRateName(s: string): s is RateName {
    return displayRates.has(s as RateName)
}

/** Formats rates and counts according to the display settings. */
export class Formatter {
    rateName: RateName = DEFAULT_RATE
    /** "second", "minute" or "hour". */
    longRate = "minute"
    /** Seconds per displayed time unit. */
    rateFactor: Rational = one
    displayFormat: DisplayFormat = DEFAULT_FORMAT
    ratePrecision: number = DEFAULT_RATE_PRECISION
    countPrecision: number = DEFAULT_COUNT_PRECISION

    constructor() {
        this.setDisplayRate(DEFAULT_RATE)
    }

    /** Sets the time unit of displayed rates. */
    setDisplayRate(rate: RateName): void {
        this.rateName = rate
        this.longRate = longRateNames.get(rate) ?? "second"
        this.rateFactor = displayRates.get(rate) ?? one
    }

    /** Pads a decimal string with non-breaking spaces so that decimal points line up in a column. */
    align(s: string, prec: number): string {
        if (this.displayFormat === "rational") {
            return s
        }
        let idx = s.indexOf(".")
        if (idx === -1) {
            idx = s.length
        }
        let toAdd = prec - s.length + idx
        if (prec > 0) {
            toAdd += 1
        }
        return s + "\u00A0".repeat(Math.max(0, toAdd))
    }

    /** Formats a rate given per second in the displayed time unit. */
    rate(rate: Rational): string {
        const scaled = rate.mul(this.rateFactor)
        return this.displayFormat === "rational" ? scaled.toMixed() : scaled.toDecimal(this.ratePrecision)
    }

    /** Formats and aligns a rate given per second. */
    alignRate(rate: Rational): string {
        return this.align(this.rate(rate), this.ratePrecision)
    }

    /** Formats a building count, rounded up. */
    count(count: Rational): string {
        return this.displayFormat === "rational" ? count.toMixed() : count.toUpDecimal(this.countPrecision)
    }

    /** Formats and aligns a building count. */
    alignCount(count: Rational): string {
        return this.align(this.count(count), this.countPrecision)
    }
}

// SPDX-FileCopyrightText: 2019 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Number formatting for rates and building counts, with column alignment.

import { Rational, one } from "../core/rational.ts"

/** Time unit of displayed rates: per second, minute or hour. */
export type RateName = "s" | "m" | "h"

/** Displayed number format. */
export type DisplayFormat = "decimal" | "rational"

/** Default time unit of displayed rates. */
export const DEFAULT_RATE: RateName = "m"
/** Default number of fractional digits of rates. */
export const DEFAULT_RATE_PRECISION = 3
/** Default number of fractional digits of building counts. */
export const DEFAULT_COUNT_PRECISION = 1
/** Largest number of fractional digits of rates and building counts. */
export const MAX_PRECISION = 20
/** Default number format. */
export const DEFAULT_FORMAT: DisplayFormat = "decimal"

const displayRates: ReadonlyMap<RateName, Rational> = new Map([
    ["s", one],
    ["m", Rational.from_float(60)],
    ["h", Rational.from_float(3600)],
])

/** The time units by rate name, as shown in labels. */
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
    longRate: string = longRateNames.get(DEFAULT_RATE) ?? ""

    /** Seconds per displayed time unit. */
    rateFactor: Rational = displayRates.get(DEFAULT_RATE) ?? one

    displayFormat: DisplayFormat = DEFAULT_FORMAT
    ratePrecision: number = DEFAULT_RATE_PRECISION
    countPrecision: number = DEFAULT_COUNT_PRECISION

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

    /** Formats a rate given per second with its unit, such as "12/m". */
    rateWithUnit(rate: Rational): string {
        return `${this.rate(rate)}/${this.rateName}`
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

// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Reads numbers that the user types into input fields.

import { Rational, zero } from "../core/rational.ts"

/** Parses a decimal, fraction or mixed number. Returns null if text is no such number. */
export function toRational(text: string): Rational | null {
    try {
        return Rational.from_string(text)
    } catch {
        return null
    }
}

/** Parses a whole number from 0 to max. Returns null for anything else, including empty text. */
export function toCount(text: string, max: number): number | null {
    const value = text.trim() === "" ? Number.NaN : Number(text)
    return Number.isInteger(value) && value >= 0 && value <= max ? value : null
}

/**
 * Reads a decimal, fraction or mixed number of zero or more from input. Returns null, marks the
 * input as invalid and shows the browser's validation message if the text is no such number.
 */
export function readRational(input: HTMLInputElement): Rational | null {
    let value = toRational(input.value)
    if (value?.less(zero)) {
        value = null
    }

    input.setCustomValidity(value === null ? "Enter a number of zero or more, such as 1.5, 3/2 or 1+1/2." : "")
    input.reportValidity()
    return value
}

/**
 * Reads a whole number from 0 to max from input. Returns null, marks the input as invalid and shows
 * the browser's validation message if the text is no such number.
 */
export function readCount(input: HTMLInputElement, max: number): number | null {
    const value = toCount(input.value, max)
    input.setCustomValidity(value === null ? `Enter a whole number from 0 to ${max}.` : "")
    input.reportValidity()
    return value
}

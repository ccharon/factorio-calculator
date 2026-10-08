// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Reads numbers that the user types into input fields.

import { Rational, zero } from "../core/rational.ts"

/**
 * Reads a decimal, fraction or mixed number of zero or more from input. Returns null, marks the
 * input as invalid and shows the browser's validation message if the text is no such number.
 */
export function readRational(input: HTMLInputElement): Rational | null {
    let value: Rational | null
    try {
        value = Rational.from_string(input.value)
    } catch {
        value = null
    }
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
    const value = input.value.trim() === "" ? Number.NaN : Number(input.value)
    const valid = Number.isInteger(value) && value >= 0 && value <= max
    input.setCustomValidity(valid ? "" : `Enter a whole number from 0 to ${max}.`)
    input.reportValidity()
    return valid ? value : null
}

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

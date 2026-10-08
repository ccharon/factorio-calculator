// SPDX-FileCopyrightText: 2015-2024 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Color schemes. Their colors are CSS custom properties, defined per scheme in calc.css.

/** A named color scheme, selected by the data-color-scheme attribute of the root element. */
export class ColorScheme {
    readonly name: string
    readonly key: string

    constructor(name: string, key: string) {
        this.name = name
        this.key = key
    }

    /** Makes this scheme the active one. */
    apply(): void {
        document.documentElement.setAttribute("data-color-scheme", this.key)
    }
}

/** The available color schemes. The first one is the default. */
export const colorSchemes: readonly ColorScheme[] = [
    new ColorScheme("Default", "default"),
    new ColorScheme("Printer-friendly", "printer"),
]

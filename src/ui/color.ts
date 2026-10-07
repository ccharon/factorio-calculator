/*Copyright 2015-2024 Kirk McDonald
Copyright 2026 Christian Charon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
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

export const colorSchemes: readonly ColorScheme[] = [
    new ColorScheme("Default", "default"),
    new ColorScheme("Printer-friendly", "printer"),
]

/*Copyright 2015-2024 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Dropdown for choosing a module, used for module slots, beacons and the default module settings.

import type * as d3 from "d3"
import type { Module } from "../data/module.ts"
import { addInputs, makeDropdown } from "./dropdown.ts"
import { getSprite } from "./icon.ts"

/** One choice in a module dropdown. */
export interface ModuleInput {
    readonly cell: ModuleCell
    /** The module, or null for an empty slot. */
    readonly module: Module | null
    /** Returns whether this choice is the selected one. */
    checked(): boolean
    /** Selects this choice. */
    choose(): void
}

/** One module dropdown: a radio group of module choices in rows. */
export interface ModuleCell {
    /** Radio group name, unique on the page. */
    readonly name: string
    readonly inputRows: readonly (readonly ModuleInput[])[]
}

/**
 * Renders one module dropdown per cell into selector. data is a list of cells or a function
 * that returns the cells for the selector's datum.
 */
export function moduleDropdown<GElement extends HTMLElement, Datum, PElement extends d3.BaseType, PDatum>(
    selector: d3.Selection<GElement, Datum, PElement, PDatum>,
    data: readonly ModuleCell[] | ((d: Datum) => readonly ModuleCell[]),
): void {
    const wrappers = selector.selectAll<HTMLSpanElement, ModuleCell>("span.module-wrapper")
        .data(typeof data === "function" ? (d: Datum) => data(d) : data)
        .join(enter => {
            const s = enter.append("span")
                .classed("module-wrapper", true)
            makeDropdown(s)
            return s
        })
    wrappers.selectAll<HTMLDivElement, ModuleCell>("div.dropdown")
        .selectAll<HTMLDivElement, readonly ModuleInput[]>("div.moduleRow")
        .data(d => d.inputRows)
        .join("div")
            .classed("moduleRow", true)
            .selectAll<HTMLSpanElement, ModuleInput>("span.input")
            .data(d => d)
            .join(
                enter => {
                    const s = enter.append("span")
                        .classed("input", true)
                    const label = addInputs(s, d => d.cell.name, d => d.checked(), d => d.choose())
                    label.append(function (d) {
                        if (d.module === null) {
                            return getSprite("slot_icon_module").icon.make(32)
                        }
                        // The tooltip goes next to the whole dropdown, not the icon.
                        const dropdownNode = this.parentElement?.parentElement?.parentElement ?? undefined
                        return d.module.icon.make(32, false, dropdownNode)
                    })
                    return s
                },
                update => {
                    update.selectAll<HTMLInputElement, ModuleInput>("input").property("checked", d => d.checked())
                    return update
                },
            )
}

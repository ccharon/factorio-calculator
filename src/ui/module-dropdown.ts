// SPDX-FileCopyrightText: 2015-2024 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Dropdown for choosing a module, used for module slots, beacons and the default module settings.

import type * as d3 from "d3"
import type { Module } from "../data/module.ts"
import { addInputs, makeDropdown } from "./dropdown.ts"
import { ICON_SIZE, getSprite } from "./icon.ts"
import { iconOf } from "./icons.ts"

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
    const cells = typeof data === "function" ? (d: Datum): readonly ModuleCell[] => data(d) : data
    const wrappers = selector.selectAll<HTMLSpanElement, ModuleCell>("span.module-wrapper").data(cells).join(enter => {
        const s = enter.append("span").classed("module-wrapper", true)
        makeDropdown(s)
        return s
    })

    // select() passes the current cell on to a dropdown that already exists.
    const dropdowns = wrappers.select<HTMLDivElement>("div.dropdown")
    const rows = dropdowns.selectAll<HTMLDivElement, readonly ModuleInput[]>("div.moduleRow").data(d => d.inputRows).join("div").classed("moduleRow", true)
    rows.selectAll<HTMLSpanElement, ModuleInput>("span.input").data(d => d).join(enter => {
        const s = enter.append("span").classed("input", true)
        const label = addInputs(s, d => d.cell.name, d => d.checked(), d => d.choose())
        label.append(function (d) {
            if (d.module === null) {
                return iconOf(getSprite("slot_icon_module")).make(ICON_SIZE)
            }
            // The tooltip goes next to the whole dropdown, not the icon.
            const dropdownNode = this.parentElement?.parentElement?.parentElement ?? undefined
            return iconOf(d.module).make(ICON_SIZE, false, dropdownNode)
        })
        return s
    }, update => {
        update.select<HTMLInputElement>("input").property("checked", d => d.checked())
        return update
    })
}

/*Copyright 2019-2021 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Icon dropdowns: a row of radio buttons with icon labels that shows only the selected one
// until clicked.

import * as d3 from "d3"

/** Called with the dropdown wrapper when it opens or closes. */
export type DropdownCallback = (dropdown: d3.Selection<HTMLDivElement, unknown, null, undefined>) => void

interface DropdownState {
    readonly dropdownNode: HTMLDivElement
    readonly onOpen: DropdownCallback | undefined
    readonly onClose: DropdownCallback | undefined
}

const dropdownLocal = d3.local<DropdownState>()

// Opens or closes the dropdown that contains element.
function toggleDropdown(element: Element): void {
    const state = dropdownLocal.get(element)
    if (state === undefined) {
        return
    }
    const dropdown = d3.select<HTMLDivElement, unknown>(state.dropdownNode)
    const classes = state.dropdownNode.classList
    if (classes.contains("open")) {
        classes.remove("open")
        state.onClose?.(dropdown)
    } else {
        // The spacer keeps the closed dropdown's size while the open one floats above it.
        const selected = dropdown.select<HTMLLabelElement>("input:checked + label")
        dropdown.select(".spacer").style("width", selected.style("width")).style("height", selected.style("height"))
        classes.add("open")
        state.onOpen?.(dropdown)
    }
}

/**
 * Appends a dropdown to each element of selector. Returns the selection of the dropdown content
 * divs, which take the inputs.
 */
export function makeDropdown<GElement extends HTMLElement, Datum, PElement extends d3.BaseType, PDatum>(
    selector: d3.Selection<GElement, Datum, PElement, PDatum>,
    onOpen?: DropdownCallback,
    onClose?: DropdownCallback,
): d3.Selection<HTMLDivElement, Datum, PElement, PDatum> {
    const wrapper = selector.append("div").classed("dropdownWrapper", true).each(function () {
        dropdownLocal.set(this, { dropdownNode: this, onOpen, onClose })
    })
    wrapper.append("div").classed("clicker", true).on("click", function () {
        toggleDropdown(this)
    })
    const inner = wrapper.append("div").classed("dropdown", true).on("click", function () {
        toggleDropdown(this)
    })
    wrapper.append("div").classed("spacer", true)
    return inner
}

let inputId = 0

/**
 * Appends a radio input and its label to each element of selector. Returns the labels, which
 * take the icon.
 *
 * @param name - Radio group name. Must be unique to the dropdown.
 * @param checked - Returns whether an input is the selected one.
 * @param callback - Called with the datum when an input is selected.
 */
export function addInputs<GElement extends HTMLElement, Datum, PElement extends d3.BaseType, PDatum>(
    selector: d3.Selection<GElement, Datum, PElement, PDatum>,
    name: string | ((d: Datum) => string),
    checked: (d: Datum) => boolean,
    callback: (d: Datum) => void,
): d3.Selection<HTMLLabelElement, Datum, PElement, PDatum> {
    const ids = new Map<Element, string>()
    selector.each(function () {
        ids.set(this, `input-${inputId++}`)
    })
    selector.append("input").on("change", function (_event: Event, d: Datum) {
        toggleDropdown(this)
        callback(d)
    }).attr("id", function () {
        return this.parentElement === null ? "" : ids.get(this.parentElement) ?? ""
    }).attr("name", typeof name === "string" ? name : d => name(d)).attr("type", "radio").property("checked", checked)
    return selector.append("label").attr("for", function () {
        return this.parentElement === null ? "" : ids.get(this.parentElement) ?? ""
    })
}

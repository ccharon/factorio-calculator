// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Icon dropdowns: a radio group with icon labels that shows only the selected one until clicked.
// The open dropdown is a popover over its place in the page (see .dropdown in dropdown.css).

import * as d3 from "d3"

/** Called with the dropdown content div when it opens or closes. */
export type DropdownCallback = (dropdown: d3.Selection<HTMLDivElement, unknown, null, undefined>) => void

let anchorCount = 0

// Closes the dropdown that contains element.
function closeDropdown(element: Element): void {
    const dropdown = element.closest<HTMLDivElement>(".dropdown")
    if (dropdown?.matches(":popover-open")) {
        dropdown.hidePopover()
        dropdown.focus()
    }
}

// Opens a closed dropdown. The wrapper keeps the closed size while the content floats above it.
function openDropdown(dropdown: HTMLDivElement): void {
    if (dropdown.matches(":popover-open")) {
        return
    }
    const wrapper = dropdown.parentElement
    if (wrapper !== null) {
        wrapper.style.width = `${wrapper.offsetWidth}px`
        wrapper.style.height = `${wrapper.offsetHeight}px`
    }
    dropdown.showPopover()
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
        this.style.setProperty("anchor-name", `--dropdown-${anchorCount++}`)
    })

    const inner = wrapper.append("div").classed("dropdown", true).attr("popover", "auto").attr("tabindex", 0).attr("role", "button")
    inner.each(function () {
        this.style.setProperty("position-anchor", this.parentElement?.style.getPropertyValue("anchor-name") ?? "")
    })
    inner.on("click", function (event: MouseEvent) {
        if (event.target instanceof HTMLInputElement) {
            // The second click of a label click. The first one, on the label, was handled already.
            return
        }
        if (!this.matches(":popover-open")) {
            openDropdown(this)
        } else if (event.target instanceof Element && event.target.closest("input:checked + label") !== null) {
            // A click on the selected choice changes nothing, so no change event closes the dropdown.
            closeDropdown(this)
        }
    }).on("keydown", function (event: KeyboardEvent) {
        if (event.target === this && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault()
            openDropdown(this)
        } else if (event.target instanceof HTMLInputElement && event.target.type === "radio" && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault()
            closeDropdown(this)
        }
    }).on("toggle", function (event: ToggleEvent) {
        const dropdown = d3.select<HTMLDivElement, unknown>(this)
        if (event.newState === "open") {
            dropdown.select<HTMLInputElement>("input:checked").node()?.focus({ preventScroll: true })
            onOpen?.(dropdown)
        } else {
            this.parentElement?.style.removeProperty("width")
            this.parentElement?.style.removeProperty("height")
            onClose?.(dropdown)
        }
    })

    return inner
}

let inputId = 0
// The choices made with arrow keys in an open dropdown, by radio group name, applied when it closes.
const pendingChoices = new WeakMap<Element, Map<string, () => void>>()

/**
 * Appends a radio input and its label to each element of selector. Returns the labels, which
 * take the icon.
 *
 * @param name - Radio group name, unique on the page. A dropdown may hold several groups.
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

    // Arrow keys change the selection without closing the dropdown. The choice takes effect when the
    // dropdown closes, because the callback may rebuild the dropdown.
    let fromKeyboard = false
    selector.append("input").on("keydown", (event: KeyboardEvent) => {
        fromKeyboard = event.key.startsWith("Arrow")
    }).on("change", function (_event: Event, d: Datum) {
        const dropdown = this.closest(".dropdown")
        if (fromKeyboard && dropdown !== null) {
            let pending = pendingChoices.get(dropdown)
            if (pending === undefined) {
                const choices = new Map<string, () => void>()
                pending = choices
                pendingChoices.set(dropdown, choices)
                dropdown.addEventListener("toggle", () => {
                    pendingChoices.delete(dropdown)
                    for (const choose of choices.values()) {
                        choose()
                    }
                }, { once: true })
            }
            pending.set(this.name, () => callback(d))
        } else {
            closeDropdown(this)
            callback(d)
        }
        fromKeyboard = false
    }).attr("id", function () {
        return this.parentElement === null ? "" : ids.get(this.parentElement) ?? ""
    }).attr("name", typeof name === "string" ? name : d => name(d)).attr("type", "radio").property("checked", checked)

    return selector.append("label").attr("for", function () {
        return this.parentElement === null ? "" : ids.get(this.parentElement) ?? ""
    })
}

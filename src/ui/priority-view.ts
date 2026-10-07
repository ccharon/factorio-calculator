/*Copyright 2024 Kirk McDonald
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
// The Resources tab: shows the resource priority list and edits it by drag and drop or with the
// arrow keys.

import * as d3 from "d3"
import { spec } from "../state/factory.ts"
import type { PriorityLevel, PriorityList, Resource } from "../state/priority.ts"
import { iconOf } from "./icons.ts"
import { readRational } from "./number-input.ts"

/** One row of the list: an end marker, the divider before a level, or a level. */
type Row =
    | { readonly kind: "start" }
    | { readonly kind: "end" }
    | { readonly kind: "middle", readonly level: PriorityLevel }
    | { readonly kind: "level", readonly level: PriorityLevel }

type DivSelection<T> = d3.Selection<HTMLDivElement, T, d3.BaseType, unknown>

// The resource being dragged, or null.
let dragItem: Resource | null = null

const levelIds = new WeakMap<PriorityLevel, number>()
let levelCount = 0

// Returns a key that stays the same for a level as long as it exists.
function rowKey(row: Row): string {
    if (row.kind === "start" || row.kind === "end") {
        return row.kind
    }
    let id = levelIds.get(row.level)
    if (id === undefined) {
        id = levelCount++
        levelIds.set(row.level, id)
    }
    return `${row.kind}-${id}`
}

function container(): d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> {
    return d3.select<HTMLDivElement, unknown>("#resource_settings")
}

// Moves the dragged resource to where row places it.
function drop(list: PriorityList, row: Row, resource: Resource): void {
    switch (row.kind) {
        case "start":
            list.moveToNewLevel(resource, list.getFirstLevel())
            break
        case "end":
            list.moveToNewLevel(resource, null)
            break
        case "middle":
            list.moveToNewLevel(resource, row.level)
            break
        case "level":
            if (list.levelOf(resource) !== row.level) {
                list.moveTo(resource, row.level)
            }
            break
    }
}

// Makes the rows accept dropped resources.
function makeDropTarget(rows: DivSelection<Row>): void {
    rows.on("dragover", (event: DragEvent) => {
        event.preventDefault()
    }).on("dragenter", (event: DragEvent) => {
        (event.currentTarget as HTMLElement).classList.add("highlight")
    }).on("dragleave", (event: DragEvent) => {
        if (event.target === event.currentTarget) {
            (event.currentTarget as HTMLElement).classList.remove("highlight")
        }
    }).on("drop", (event: DragEvent, row: Row) => {
        const resource = dragItem
        if (resource === null) {
            return
        }
        event.preventDefault()
        ;(event.currentTarget as HTMLElement).classList.remove("highlight")
        // The source element may be gone after the update, and then no dragend arrives.
        dragItem = null
        container().classed("dragging", false)
        drop(spec.priority, row, resource)
        spec.updateSolution()
    })
}

// Focuses the icon of resource.
function focusResource(resource: Resource): void {
    container().selectAll<HTMLDivElement, Resource>("div.resource").filter(r => r === resource).select<HTMLImageElement>("img").node()?.focus()
}

// Creates the element of a resource: its icon and its weight input.
function createResources(enter: d3.Selection<d3.EnterElement, Resource, HTMLDivElement, Row>): d3.Selection<HTMLDivElement, Resource, HTMLDivElement, Row> {
    const div = enter.append("div").classed("resource", true)
    div.on("dragstart", function (event: DragEvent, resource: Resource) {
        // The icon is a transparent image with the sprite as background, so the browser's own drag image is empty.
        event.dataTransfer?.setDragImage(this, 24, 24)
        dragItem = resource
        // Chrome cancels the drag if the source loses its pointer events during dragstart.
        setTimeout(() => {
            this.classList.add("dragged")
            container().classed("dragging", true)
        })
    }).on("dragend", function () {
        this.classList.remove("dragged")
        container().classed("dragging", false)
        dragItem = null
    })

    // The icon takes the keyboard focus: left and right select another resource, up and down move this one.
    // It is no <button>, because Chrome does not drag an image inside a button.
    const icon = div.append(resource => iconOf(resource.recipe).make(48))
    icon.attr("tabindex", 0).attr("role", "button").attr("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown")
    icon.on("keydown", function (event: KeyboardEvent, resource: Resource) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault()
            const icons = container().selectAll<HTMLImageElement, unknown>("img[tabindex]").nodes()
            icons[icons.indexOf(this) + (event.key === "ArrowLeft" ? -1 : 1)]?.focus()
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            spec.priority.moveStep(resource, event.key === "ArrowUp" ? -1 : 1)
            spec.updateSolution()
            focusResource(resource)
        }
    })

    div.append("input").attr("type", "text").attr("size", 4).on("change", function (_event: Event, resource: Resource) {
        const weight = readRational(this)
        if (weight !== null) {
            spec.priority.setWeight(resource, weight)
            spec.updateSolution()
        }
    })
    return div
}

/** Renders list into the Resources tab. Elements of levels and resources that still exist are kept. */
export function renderPriorities(list: PriorityList): void {
    const rows: Row[] = [{ kind: "start" }]
    for (const level of list) {
        if (rows.length > 1) {
            rows.push({ kind: "middle", level })
        }
        rows.push({ kind: "level", level })
    }
    rows.push({ kind: "end" })

    const rowSelection = container().selectAll<HTMLDivElement, Row>(":scope > div").data(rows, rowKey).join(enter => {
        const div = enter.append("div")
        div.filter(row => row.kind === "start" || row.kind === "end").classed("resource-tier bookend", true)
            .append("span").text(row => row.kind === "start" ? "less valuable" : "more valuable")
        div.filter(row => row.kind === "level").classed("resource-tier", true)
        div.filter(row => row.kind === "middle").classed("middle", true)
        makeDropTarget(div)
        return div
    }).order()

    const levelRows = rowSelection.filter(row => row.kind === "level")
    const resources = levelRows.selectAll<HTMLDivElement, Resource>("div.resource")
        .data(row => row.kind === "level" ? row.level.resources : [], resource => resource.recipe.key)
        .join(createResources)
        .order()
    resources.select("input").property("value", resource => resource.weight.toString())
}

/** Focuses the first resource icon in the list. */
export function focusFirstResource(): void {
    container().select<HTMLImageElement>("img[tabindex]").node()?.focus()
}

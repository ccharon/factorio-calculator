// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Event handlers of the page controls, and the tab and visualizer state.

import * as d3 from "d3"
import { hundred } from "../core/rational.ts"
import type { Item } from "../data/item.ts"
import type { DisplayFormat } from "../state/align.ts"
import { spec } from "../state/factory.ts"
import { type GraphSVG, measureInGraphTab } from "../visualize/graph.ts"
import { renderTotals } from "../visualize/visualize.ts"
import { readRational } from "./number-input.ts"
import { focusFirstResource } from "./priority-view.ts"
import { setTitle } from "./settings.ts"
import { addTarget } from "./target.ts"

/** The tabs of the page. Each has a #<name>_tab element and a #<name>_button. */
export const TAB_NAMES = ["totals", "graph", "resources", "settings", "faq", "about", "debug"] as const
/** The name of a tab. */
export type TabName = typeof TAB_NAMES[number]

/** The layouts of the visualizer. */
export const VISUALIZER_TYPES = ["sankey", "boxline"] as const
/** A layout of the visualizer. */
export type VisualizerType = typeof VISUALIZER_TYPES[number]

/** The render modes of the visualizer: zoomable inside a frame, or at the natural size of the diagram. */
export const RENDER_MODES = ["zoom", "fix"] as const
/** A render mode of the visualizer. */
export type RenderMode = typeof RENDER_MODES[number]

/** The flow directions of the visualizer. */
export const DIRECTIONS = ["right", "down"] as const
/** A flow direction of the visualizer. */
export type Direction = typeof DIRECTIONS[number]

function oneOf<T extends string>(values: readonly T[], value: string): value is T {
    return (values as readonly string[]).includes(value)
}

function inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value
}

// build target events

/** Adds a build target for the default item. */
export function plusHandler(): void {
    addTarget()
    spec.updateSolution()
}

// tab events

export const DEFAULT_TAB: TabName = "totals"

/** The visible tab. */
export let currentTab: TabName = DEFAULT_TAB

/** Shows the named tab. Unknown names show the default tab. */
export function clickTab(tabName: string): void {
    currentTab = oneOf(TAB_NAMES, tabName) ? tabName : DEFAULT_TAB
    d3.selectAll(".tab").style("display", "none")
    d3.selectAll(".tab_button").classed("active", false)
    d3.select(`#${currentTab}_tab`).style("display", "block")
    d3.select(`#${currentTab}_button`).classed("active", true)
    spec.setHash()
}

/** Shows the visualizer tab and renders the current solution. */
export function clickVisualize(): void {
    clickTab("graph")
    renderTotals(spec.lastTotals, spec.ignore)
}

// shared events

/** Toggles whether the clicked row's item is ignored. */
export function toggleIgnoreHandler(_event: Event, d: { readonly item: Item }): void {
    spec.toggleIgnore(d.item)
    spec.updateSolution()
}

// setting events

/** Applies the page title input. */
export function changeTitle(event: Event): void {
    setTitle(inputValue(event))
    spec.setHash()
}

/** Applies the rate precision input. */
export function changeRatePrecision(event: Event): void {
    spec.format.ratePrecision = Number(inputValue(event))
    spec.display()
}

/** Applies the count precision input. */
export function changeCountPrecision(event: Event): void {
    spec.format.countPrecision = Number(inputValue(event))
    spec.display()
}

/** Applies the number format radio buttons. */
export function changeFormat(event: Event): void {
    const value = inputValue(event)
    const format: DisplayFormat = value === "rational" ? "rational" : "decimal"
    spec.format.displayFormat = format
    spec.display()
}

/** Applies the mining productivity input, given in percent. */
export function changeMprod(event: Event): void {
    const percent = readRational(event.target as HTMLInputElement)
    if (percent !== null) {
        spec.miningProd = percent.div(hundred)
        spec.updateSolution()
    }
}

// visualizer events

export const DEFAULT_VISUALIZER: VisualizerType = "sankey"

/** The selected visualizer layout. */
export let visualizerType: VisualizerType = DEFAULT_VISUALIZER

/** Sets the visualizer type. Unknown values select the default. */
export function setVisualizerType(vt: string): void {
    visualizerType = oneOf(VISUALIZER_TYPES, vt) ? vt : DEFAULT_VISUALIZER
}

/** Applies the visualizer type radio buttons and resets the direction to the type's default. */
export function changeVisType(event: Event): void {
    setVisualizerType(inputValue(event))
    visualizerDirection = getDefaultVisDirection()
    d3.select(`#${visualizerDirection}_direction`).property("checked", true)
    spec.display()
}

/** Render mode when the URL sets none. */
export const DEFAULT_RENDER: RenderMode = "zoom"

/** The selected render mode. */
export let visualizerRender: RenderMode = DEFAULT_RENDER

/** Sets the render mode. Unknown values select the default. */
export function setVisualizerRender(vr: string): void {
    visualizerRender = oneOf(RENDER_MODES, vr) ? vr : DEFAULT_RENDER
}

/** Applies the render mode radio buttons. */
export function changeVisRender(event: Event): void {
    setVisualizerRender(inputValue(event))
    spec.display()
}

/** Returns the default direction of the current visualizer type. */
export function getDefaultVisDirection(): Direction {
    return visualizerType === "sankey" ? "right" : "down"
}

/** The selected flow direction. */
export let visualizerDirection: Direction = getDefaultVisDirection()

/** Returns whether the direction is the default of the current visualizer type. */
export function isDefaultVisDirection(): boolean {
    return visualizerDirection === getDefaultVisDirection()
}

/** Sets the graph direction. Unknown values select the type's default. */
export function setVisualizerDirection(vd: string): void {
    visualizerDirection = oneOf(DIRECTIONS, vd) ? vd : getDefaultVisDirection()
}

/** Applies the direction radio buttons. */
export function changeVisDir(event: Event): void {
    setVisualizerDirection(inputValue(event))
    spec.display()
}

/** Whether the visualizer shows electricity and the buildings that only supply it. */
export let visualizerElectricity = false

/** Sets whether the visualizer shows electricity. */
export function setVisualizerElectricity(show: boolean): void {
    visualizerElectricity = show
}

/** Applies the electricity checkbox. */
export function changeVisElectricity(event: Event): void {
    setVisualizerElectricity(event.target instanceof HTMLInputElement && event.target.checked)
    spec.display()
}

// Zoom range relative to the whole diagram: from ten times larger to slightly smaller.
const MAX_ZOOM = 10
const MIN_ZOOM = 10 / 12
// Aspect ratio of the visualizer viewport.
const ASPECT_RATIO = 16 / 9

/** Adds zoom with the mouse wheel and panning by dragging to the visualizer SVG. The view starts at the top of the diagram. */
export function installSVGEvents(svg: GraphSVG): void {
    const node = svg.node()
    if (node === null) {
        return
    }

    const box = measureInGraphTab(svg, () => node.getBBox())

    // Widen the viewport to the aspect ratio, centered on the diagram.
    let { x, y, width, height } = box
    if (width / height < ASPECT_RATIO) {
        x -= (height * ASPECT_RATIO - width) / 2
        width = height * ASPECT_RATIO
    } else {
        y -= (width / ASPECT_RATIO - height) / 2
        height = width / ASPECT_RATIO
    }

    svg.attr("viewBox", `${x} ${box.y} ${width} ${height}`)
    const layers = svg.selectAll<SVGGElement, unknown>(":scope > g")
    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([MIN_ZOOM, MAX_ZOOM])
        .translateExtent([[x, Math.min(y, box.y)], [x + width, Math.max(y, box.y) + height]])
        .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => layers.attr("transform", event.transform.toString()))
    svg.call(zoom)
}

// debug events

/** Applies the debug checkbox. */
export function toggleDebug(event: Event): void {
    spec.debug = (event.target as HTMLInputElement).checked
    spec.display()
}

/** Selects the first resource when an arrow key is pressed in the Resources tab while nothing or a tab button has the focus. */
export function resourceKeyHandler(event: KeyboardEvent): void {
    const arrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    const resourcesVisible = document.getElementById("resources_tab")?.style.display === "block"
    const focus = document.activeElement
    if (arrow && resourcesVisible && (focus === null || focus === document.body || focus.matches("div.tabs button"))) {
        event.preventDefault()
        focusFirstResource()
    }
}

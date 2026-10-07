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
// Event handlers of the page controls, and the tab and visualizer state.

import * as d3 from "d3"
import { Rational } from "../core/rational.ts"
import type { Item } from "../data/item.ts"
import type { DisplayFormat } from "../state/align.ts"
import { spec } from "../state/factory.ts"
import { renderTotals } from "../visualize/visualize.js"
import { setTitle } from "./settings.js"

export const TAB_NAMES = ["totals", "graph", "resources", "settings", "faq", "about", "debug"] as const
export type TabName = typeof TAB_NAMES[number]

export const VISUALIZER_TYPES = ["sankey", "boxline"] as const
export type VisualizerType = typeof VISUALIZER_TYPES[number]

export const RENDER_MODES = ["zoom", "fix"] as const
export type RenderMode = typeof RENDER_MODES[number]

export const DIRECTIONS = ["right", "down"] as const
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
    spec.addTarget()
    spec.updateSolution()
}

// tab events

export const DEFAULT_TAB: TabName = "totals"

export let currentTab: TabName = DEFAULT_TAB

/** Shows the named tab. Unknown names show the default tab. */
export function clickTab(tabName: string): void {
    currentTab = oneOf(TAB_NAMES, tabName) ? tabName : DEFAULT_TAB
    d3.selectAll(".tab")
        .style("display", "none")
    d3.selectAll(".tab_button")
        .classed("active", false)
    d3.select(`#${currentTab}_tab`)
        .style("display", "block")
    d3.select(`#${currentTab}_button`)
        .classed("active", true)
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
    spec.miningProd = Rational.from_string(inputValue(event)).div(Rational.from_float(100))
    spec.updateSolution()
}

// visualizer events

export const DEFAULT_VISUALIZER: VisualizerType = "sankey"

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

export const DEFAULT_RENDER: RenderMode = "zoom"

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

// Number of distinct zoom steps.
const MAX_SCALE = 10
// Aspect ratio of the visualizer viewport.
const ASPECT_RATIO = 16 / 9

/** Adds zoom with the mouse wheel and panning by dragging to the visualizer SVG. */
export function installSVGEvents(svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>): void {
    const node = svg.node()
    if (node === null) {
        return
    }
    // The graph tab must be visible to measure the bounding box.
    const tab = d3.select<HTMLElement, unknown>("#graph_tab")
    const style = tab.style("display")
    tab.style("display", "block")
    svg.selectAll("image").style("display", "none")
    let { x, y, width, height } = node.getBBox()
    svg.selectAll("image").style("display", null)
    tab.style("display", style)
    const [diagramX, diagramY, diagramWidth, diagramHeight] = [x, y, width, height]
    if (width / height < ASPECT_RATIO) {
        const newWidth = height * ASPECT_RATIO
        x -= (newWidth - width) / 2
        width = newWidth
    } else if (width / height > ASPECT_RATIO) {
        const newHeight = width / ASPECT_RATIO
        y -= (newHeight - height) / 2
        height = newHeight
    }
    // Viewport size with the diagram centered and zoomed all the way out.
    const [origWidth, origHeight] = [width, height]
    // Start at the top of the diagram. clamp() corrects the position.
    y = diagramY
    let scale = MAX_SCALE

    // Keeps the viewport center within the diagram.
    function clamp(): void {
        const midX = x + width / 2
        const midY = y + height / 2
        if (diagramX > midX) {
            x = diagramX - width / 2
        } else if (diagramX + diagramWidth < midX) {
            x = diagramX + diagramWidth - width / 2
        }
        if (diagramY > midY) {
            y = diagramY - height / 2
        } else if (diagramY + diagramHeight < midY) {
            y = diagramY + diagramHeight - height / 2
        }
    }
    function setViewBox(): void {
        clamp()
        svg.attr("viewBox", `${x} ${y} ${width} ${height}`)
    }
    function point(event: MouseEvent, svgNode: SVGSVGElement): DOMPoint {
        const ctm = svgNode.getScreenCTM()
        const clientPoint = new DOMPoint(event.clientX, event.clientY)
        return ctm ? clientPoint.matrixTransform(ctm.inverse()) : clientPoint
    }
    let clickPt: DOMPoint | null = null
    svg.on("wheel", (event: WheelEvent) => {
        event.preventDefault()
        const origScale = scale
        if (event.deltaY < 0) {
            if (scale === 1) {
                return
            }
            scale -= 1
        } else if (event.deltaY > 0) {
            if (scale === MAX_SCALE + 2) {
                return
            }
            scale += 1
        }
        const pt = point(event, node)
        x = pt.x - (pt.x - x) / origScale * scale
        y = pt.y - (pt.y - y) / origScale * scale
        width = origWidth * (scale / MAX_SCALE)
        height = origHeight * (scale / MAX_SCALE)
        setViewBox()
    })
    svg.on("mousedown", (event: MouseEvent) => {
        clickPt = point(event, node)
        event.preventDefault()
    })
    svg.on("mousemove", (event: MouseEvent) => {
        if (clickPt === null) {
            return
        }
        const pt = point(event, node)
        x -= pt.x - clickPt.x
        y -= pt.y - clickPt.y
        setViewBox()
        event.preventDefault()
    })
    svg.on("mouseup", (event: MouseEvent) => {
        clickPt = null
        event.preventDefault()
    })
    setViewBox()
}

// debug events

/** Applies the debug checkbox. */
export function toggleDebug(event: Event): void {
    spec.debug = (event.target as HTMLInputElement).checked
    spec.display()
}

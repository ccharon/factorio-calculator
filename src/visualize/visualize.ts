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
// Builds the visualizer graph from a solution and renders it in the selected layout.
import * as d3 from "d3"
import type { Item } from "../data/item.ts"
import { ELECTRICITY, isRecipeLike, type RecipeNode } from "../data/recipe.ts"
import { zero } from "../core/rational.ts"
import type { ItemLink, Totals } from "../core/totals.ts"
import { spec } from "../state/factory.ts"
import { visualizerType, visualizerRender, visualizerDirection, visualizerElectricity, installSVGEvents } from "../ui/events.ts"
import { renderBoxGraph } from "./boxline.ts"
import { GraphEdge, GraphNode, type Graph } from "./graph.ts"
import { renderSankey } from "./sankey.ts"

// Electricity flows into a building, unless it is a target of the factory.
function isElectricityUse({ item, to }: ItemLink): boolean {
    return item.key === ELECTRICITY && to.isReal()
}

// Returns the recipes whose whole output is electricity use or goes to other such recipes:
// generators, the electricity import, and the boilers and pumps that only feed generators.
function electricitySuppliers(totals: Totals): Set<RecipeNode> {
    const outgoing = new Map<RecipeNode, ItemLink[]>()
    for (const link of totals.proportionate) {
        outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), link])
    }

    const hidden = new Set<RecipeNode>()
    let changed = true
    while (changed) {
        changed = false
        for (const [recipe, links] of outgoing) {
            if (!hidden.has(recipe) && links.every(link => isElectricityUse(link) || hidden.has(link.to))) {
                hidden.add(recipe)
                changed = true
            }
        }
    }
    return hidden
}

function makeGraph(totals: Totals): Graph {
    const hidden = visualizerElectricity ? new Set<RecipeNode>() : electricitySuppliers(totals)
    const nodes: GraphNode[] = []
    const nodeMap = new Map<RecipeNode, GraphNode>()
    for (const [recipe, rate] of totals.rates) {
        if (hidden.has(recipe)) {
            continue
        }
        let node: GraphNode
        if (isRecipeLike(recipe)) {
            node = new GraphNode(recipe.name, recipe, spec.getBuilding(recipe), spec.getCount(recipe, rate), rate)
        } else {
            node = new GraphNode(recipe.name, recipe, null, zero, null)
        }
        nodes.push(node)
        nodeMap.set(recipe, node)
    }

    function nodeOf(recipe: RecipeNode): GraphNode {
        const node = nodeMap.get(recipe)
        if (node === undefined) {
            throw new Error(`missing graph node: ${recipe.name}`)
        }
        return node
    }

    const links: GraphEdge[] = []
    for (const link of totals.proportionate) {
        const { item, from, to, rate, fuel } = link
        if (hidden.has(from) || hidden.has(to) || (!visualizerElectricity && isElectricityUse(link))) {
            continue
        }
        let value = rate.toFloat()
        if (item.phase === "fluid") {
            // Fluids operate on a different scale.
            value /= 10
        }
        const beltCount = item.phase === "solid" ? rate.div(spec.belt.rate) : null
        const extra = from.products.length > 1
        links.push(new GraphEdge(nodeOf(from), nodeOf(to), value, item, rate, fuel, beltCount, extra))
    }
    return { nodes, links }
}

// Sizes svg#graph: zoomable inside a frame, or at its natural size.
function fitSVG(): void {
    const svg = d3.select<SVGSVGElement, unknown>("svg#graph")
    const tab = d3.select<HTMLElement, unknown>("#graph_tab")
    if (visualizerRender === "zoom") {
        tab.style("min-width", 0)
        svg.attr("width", null)
        svg.attr("height", null)
        svg.style("border", "1px var(--foreground) solid")
        installSVGEvents(svg)
        return
    }

    const node = svg.node()
    if (node === null) {
        return
    }
    tab.style("min-width", "max-content")
    const style = tab.style("display")
    tab.style("display", "block")
    // Hide images so the sprite sheet doesn't throw off the bounding box.
    svg.selectAll("image").style("display", "none")
    const { x, y, width, height } = node.getBBox()
    svg.selectAll("image").style("display", null)
    tab.style("display", style)

    svg.attr("viewBox", `${x} ${y} ${width} ${height}`)
        .attr("width", width)
        .attr("height", height)
        .style("border", null)
    svg.on("wheel", null)
    svg.on("mousedown", null)
    svg.on("mousemove", null)
    svg.on("mouseup", null)
}

/** Renders totals in the visualizer tab, or nothing before the first solution. Items in ignore are greyed out. */
export function renderTotals(totals: Totals | null, ignore: ReadonlySet<Item>): void {
    if (totals === null) {
        return
    }
    const data = makeGraph(totals)
    if (visualizerType === "sankey") {
        renderSankey(data, visualizerDirection, ignore)
        fitSVG()
    } else {
        renderBoxGraph(data, visualizerDirection, ignore, fitSVG)
    }
}

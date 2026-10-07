/*Copyright 2019-2024 Kirk McDonald
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
// Renders the visualizer graph as boxes and arrows laid out by dagre.
import * as d3 from "d3"
import dagre, { type GraphLabel } from "@dagrejs/dagre"
import type { Item } from "../data/item.ts"
import { spec } from "../state/factory.ts"
import { spriteSheet } from "../ui/icon.ts"
import type { Direction } from "../ui/events.ts"
import type { Point } from "./circlepath.ts"
import {
    colorOf, darkColorOf, iconSize, getColorMaps, measureText, renderNode, imageViewBox, spriteSheetURL,
    graphClickHandler, graphMouseOverHandler, graphMouseLeaveHandler,
    type EdgeLabel, type Graph, type GraphEdge, type GraphNode,
} from "./graph.ts"

const boxlineNodeMargin = 10

/** Label of a dagre node. dagre sets x and y to its center. */
interface NodeLabel {
    readonly node: GraphNode
    readonly width: number
    readonly height: number
    x?: number
    y?: number
}

const edgeLine = d3.line<Point>()
    .x(d => d.x)
    .y(d => d.y)
    .curve(d3.curveBasis)

function edgePath(edge: GraphEdge): string {
    return edgeLine(edge.points) ?? ""
}

function edgeName(link: GraphEdge): string {
    return `link-${link.index}`
}

/** An edge label after the dagre layout. */
type PlacedLabel = EdgeLabel & { x: number, y: number }

function isPlaced(label: EdgeLabel | null): label is PlacedLabel {
    return label?.x !== undefined && label.y !== undefined
}

function labelOf(link: GraphEdge): PlacedLabel {
    if (!isPlaced(link.label)) {
        throw new Error(`edge label without position: ${edgeName(link)}`)
    }
    return link.label
}

/**
 * Lays out the graph with dagre and renders it into svg#graph. Items in ignore are greyed out.
 * Calls callback after rendering.
 */
export function renderBoxGraph({ nodes, links }: Graph, direction: Direction, ignore: ReadonlySet<Item>, callback: () => void): void {
    const [itemColors, recipeColors] = getColorMaps(nodes, links)
    const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true })
    g.setGraph({ rankdir: direction === "down" ? "TB" : "LR" })

    const testSVG = d3.select("body").append("svg").classed("test", true)
    const text = testSVG.append("text")
    for (const node of nodes) {
        g.setNode(node.name, { node, width: node.labelWidth(text, boxlineNodeMargin), height: 52 })
    }
    for (const [i, link] of links.entries()) {
        link.index = i
        const s = ` × ${spec.format.rate(link.rate)}/${spec.format.rateName}`
        text.text(s)
        const label: EdgeLabel = { link, labelpos: "c", width: 32 + 10 + measureText(text), height: 32 + 10, text: s }
        link.label = label
        g.setEdge(link.source.name, link.target.name, label, edgeName(link))
    }
    text.remove()
    testSVG.remove()

    dagre.layout(g)
    for (const nodeName of g.nodes()) {
        const { node, x, y, width, height } = g.node(nodeName)
        if (x === undefined || y === undefined) {
            throw new Error(`node without position: ${nodeName}`)
        }
        node.x0 = x - width / 2
        node.y0 = y - height / 2
        node.x1 = node.x0 + width
        node.y1 = node.y0 + height
    }
    for (const edge of g.edges()) {
        const label = g.edge(edge)
        label.link.points = label.points ?? []
    }

    const svg = d3.select<SVGSVGElement, unknown>("svg#graph").classed("sankey", false)
    svg.selectAll("g").remove()

    const edges = svg.append("g")
        .classed("edges", true)
        .selectAll<SVGGElement, GraphEdge>("g")
        .data(links)
        .join("g")
        .classed("edge", true)
        .classed("fuel", d => d.fuel)
        .each(function (d) {
            d.elements.push(this)
        })
    edges.append("path")
        .classed("highlighter", true)
        .attr("fill", "none")
        .attr("stroke", d => colorOf(itemColors, d.item))
        .attr("stroke-width", 3)
        .attr("d", edgePath)
        .attr("marker-end", d => `url(#arrowhead-${edgeName(d)})`)
    edges.append("defs")
        .append("marker")
        .attr("id", d => "arrowhead-" + edgeName(d))
        .attr("viewBox", "0 0 10 10")
        .attr("refX", "9")
        .attr("refY", "5")
        .attr("markerWidth", "16")
        .attr("markerHeight", "12")
        .attr("markerUnits", "userSpaceOnUse")
        .attr("orient", "auto")
        .append("path")
        .classed("highlighter", true)
        .attr("d", "M 0,0 L 10,5 L 0,10 z")
        .attr("stroke-width", 1)
        .attr("stroke", d => colorOf(itemColors, d.item))
        .attr("fill", d => darkColorOf(itemColors, d.item))

    const edgeLabels = svg.append("g")
        .classed("edgeLabels", true)
        .selectAll<SVGGElement, GraphEdge>("g")
        .data(links)
        .join("g")
        .classed("edgeLabel", true)
        .each(function (d) {
            d.elements.push(this)
        })
    edgeLabels.append("rect")
        .classed("highlighter", true)
        .attr("x", d => labelOf(d).x - labelOf(d).width / 2)
        .attr("y", d => labelOf(d).y - labelOf(d).height / 2)
        .attr("width", d => labelOf(d).width)
        .attr("height", d => labelOf(d).height)
        .attr("rx", 6)
        .attr("ry", 6)
        .attr("fill", d => darkColorOf(itemColors, d.item))
        .attr("fill-opacity", 0)
        .attr("stroke", "none")
    edgeLabels.append("svg")
        .attr("viewBox", d => imageViewBox(d.item))
        .attr("x", d => labelOf(d).x - labelOf(d).width / 2 + 5 + 0.5)
        .attr("y", d => labelOf(d).y - iconSize / 2 + 0.5)
        .attr("width", iconSize)
        .attr("height", iconSize)
        .append("image")
        .attr("xlink:href", spriteSheetURL())
        .attr("width", spriteSheet().width)
        .attr("height", spriteSheet().height)
    edgeLabels.append("text")
        .attr("x", d => labelOf(d).x - labelOf(d).width / 2 + 5 + iconSize)
        .attr("y", d => labelOf(d).y)
        .attr("dy", "0.35em")
        .text(d => labelOf(d).text)

    const rects = svg.append("g")
        .classed("nodes", true)
        .selectAll<SVGGElement, GraphNode>("g")
        .data(nodes)
        .join("g")
        .classed("node", true)
    renderNode(rects, boxlineNodeMargin, "left", recipeColors, ignore)

    svg.append("g")
        .classed("overlay", true)
        .selectAll("rect")
        .data(nodes)
        .join("rect")
        .attr("stroke", "none")
        .attr("fill", "transparent")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("height", d => d.y1 - d.y0)
        .on("mouseover", graphMouseOverHandler)
        .on("mouseout", graphMouseLeaveHandler)
        .on("click", graphClickHandler)
        .append("title")
        .text(d => d.name)
    callback()
}

/*Copyright 2021 Kirk McDonald
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
// Renders the visualizer graph as a Sankey diagram.
import * as d3 from "d3"
import type { Item } from "../data/item.ts"
import { one } from "../core/rational.ts"
import { spec } from "../state/factory.ts"
import { spriteSheet } from "../ui/icon.ts"
import type { Direction } from "../ui/events.ts"
import { CirclePath, makeCurve } from "./circlepath.ts"
import {
    colorOf, iconSize, getColorMaps, renderNodes, imageViewBox, spriteSheetURL, graphClickHandler, graphMouseOverHandler, graphMouseLeaveHandler,
    type BeltLine, type Graph, type GraphEdge, type GraphNode,
} from "./graph.ts"
import { layoutSankey } from "./sankey-layout.ts"

const nodePadding = 36
const sankeyNodeMargin = 2

const columnWidth = 200
const maxNodeHeight = 175

function selfPath(d: GraphEdge): CirclePath {
    const x0 = d.source.x1
    const y0 = d.y0
    const x1 = d.source.x1
    const y1 = d.source.y1 + d.width / 2 + 10
    const x2 = d.target.x0
    const y2 = d.target.y1 + d.width / 2 + 10
    const x3 = d.target.x0
    const y3 = d.y1
    return new CirclePath(1, 0, [
        { x: x0, y: y0 },
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        { x: x3, y: y3 },
    ])
}

function backwardPath(d: GraphEdge): CirclePath {
    // start point
    const x0 = d.source.x1
    const y0 = d.y0
    // end point
    const x3 = d.target.x0
    const y3 = d.y1
    const y2a = d.source.y0 - d.width / 2 - 10
    const y2b = d.source.y1 + d.width / 2 + 10
    const y3a = d.target.y0 - d.width / 2 - 10
    const y3b = d.target.y1 + d.width / 2 + 10

    let starty: number
    let endy: number
    if (y2b < y3a) {
        // draw start arc down, end arc up
        starty = y2b
        endy = y3a
    } else if (y2a > y3b) {
        // draw start arc up, end arc down
        starty = y2a
        endy = y3b
    } else {
        // draw both arcs down
        starty = y2b
        endy = y3b
    }

    const curve = makeCurve(-1, 0, x0, starty, x3, endy)
    const points = [{ x: x0, y: y0 }, ...curve.points.map(({ x, y }) => ({ x, y })), { x: x3, y: y3 }]
    return new CirclePath(1, 0, points)
}

function linkPath(d: GraphEdge): CirclePath {
    if (d.direction === "self") {
        return selfPath(d)
    } else if (d.direction === "backward") {
        return backwardPath(d)
    }
    return makeCurve(1, 0, d.source.x1, d.y0, d.target.x0, d.y1, d.width)
}

function curveOf(d: GraphEdge): CirclePath {
    if (d.curve === null) {
        throw new Error(`link without curve: ${d.source.name} -> ${d.target.name}`)
    }
    return d.curve
}

/** Lays out data as a Sankey diagram and renders it into svg#graph. Items in ignore are greyed out. */
export function renderSankey(data: Graph, direction: Direction, ignore: ReadonlySet<Item>): void {
    let maxNodeWidth = 0
    const testSVG = d3.select("body").append("svg").classed("sankey test", true)
    const text = testSVG.append("text")
    for (const node of data.nodes) {
        const nodeWidth = node.labelWidth(text, sankeyNodeMargin)
        if (nodeWidth > maxNodeWidth) {
            maxNodeWidth = nodeWidth
        }
        node.width = nodeWidth
    }
    text.remove()
    testSVG.remove()

    const across = direction === "down"
    const { nodes, links } = layoutSankey(data, {
        nodeWidth: across ? nodePadding : maxNodeWidth,
        nodePadding: across ? maxNodeWidth : nodePadding,
        maxNodeHeight,
        linkLength: columnWidth,
    })
    const [itemColors, recipeColors] = getColorMaps(nodes, links)

    for (const link of links) {
        let curve = linkPath(link)
        if (across) {
            curve = curve.transpose()
        }
        link.curve = curve
        const belts: BeltLine[] = []
        if (link.beltCount !== null) {
            const dy = link.width / link.beltCount.toFloat()
            // Only render belts if there are at least three pixels per belt.
            if (dy > 3) {
                for (let i = one; i.less(link.beltCount); i = i.add(one)) {
                    const offset = i.toFloat() * dy - link.width / 2
                    belts.push({ item: link.item, curve: curve.offset(offset) })
                }
            }
        }
        link.belts = belts
    }

    if (across) {
        for (const node of nodes) {
            [node.x0, node.y0] = [node.y0, node.x0];
            [node.x1, node.y1] = [node.y1, node.x1]
        }
    }

    const svg = d3.select<SVGSVGElement, unknown>("svg#graph").classed("sankey", true)
    svg.selectAll("g").remove()

    renderNodes(svg, nodes, sankeyNodeMargin, across ? "center" : "left", recipeColors, ignore)

    // Link paths
    const link = svg.append("g")
        .classed("links", true)
        .selectAll<SVGGElement, GraphEdge>("g")
        .data(links)
        .join("g")
        .classed("link", true)
        .each(function (d) {
            d.elements.push(this)
        })

    link.append("path")
        .attr("fill", "none")
        .attr("stroke-opacity", 0.3)
        .attr("d", d => curveOf(d).path())
        .attr("stroke", d => colorOf(itemColors, d.item))
        .attr("stroke-width", d => Math.max(1, d.width))

    link.append("g")
        .selectAll("path")
        .data(d => [curveOf(d).offset(-d.width / 2), curveOf(d).offset(d.width / 2)])
        .join("path")
        .classed("highlighter", true)
        .attr("fill", "none")
        .attr("d", d => d.path())
        .attr("stroke", "none")
        .attr("stroke-width", 1)

    link.append("g")
        .classed("belts", true)
        .selectAll("path")
        .data(d => d.belts)
        .join("path")
        .classed("belt", true)
        .attr("fill", "none")
        .attr("stroke-opacity", 0.3)
        .attr("d", d => d.curve.path())
        .attr("stroke", d => colorOf(itemColors, d.item))
        .attr("stroke-width", 1)

    link.append("title").text(d => `${d.source.name} → ${d.target.name}\n${spec.format.rate(d.rate)}`)

    const linkIcon = link.filter(d => d.extra)
        .append("svg")
        .attr("viewBox", d => imageViewBox(d.item))
        .attr("x", d => d.source.x1 + 2.25)
        .attr("y", d => d.y0 - iconSize / 4 + 0.25)
        .attr("width", iconSize / 2)
        .attr("height", iconSize / 2)
    linkIcon.append("image")
        .attr("xlink:href", spriteSheetURL())
        .attr("width", spriteSheet().width)
        .attr("height", spriteSheet().height)

    if (across) {
        linkIcon
            .attr("x", d => d.y0 - iconSize / 4 + 0.25)
            .attr("y", d => d.source.y1 + 2.25)
    }

    const linkLabel = link.append("text")
        .attr("x", d => d.source.x1 + 2 + (d.extra ? iconSize / 2 : 0))
        .attr("y", d => d.y0)
        .attr("dy", "0.35em")
        .attr("text-anchor", "start")
        .text(d => (d.extra ? "× " : "") + spec.format.rate(d.rate) + "/" + spec.format.rateName)
    if (across) {
        linkLabel
            .attr("x", null)
            .attr("y", null)
            .attr("transform", d => `translate(${d.y0},${d.source.y1 + 2 + (d.extra ? 16 : 0)}) rotate(90)`)
    }

    // Overlay a transparent rect on each node for the mouse events. The graph tab is shown
    // briefly so that the bounding boxes are not empty.
    const rectElements = svg.selectAll<SVGRectElement, GraphNode>("g.node rect").nodes()
    const graphTab = d3.select<HTMLElement, unknown>("#graph_tab")
    const origDisplay = graphTab.style("display")

    graphTab.style("display", "block")

    const overlayData = nodes.map((node, i) => {
        const element = rectElements[i]
        if (element === undefined) {
            throw new Error(`missing rect of node ${node.name}`)
        }

        return { rect: element.getBBox(), node }
    })

    graphTab.style("display", origDisplay)

    svg.append("g")
        .classed("overlay", true)
        .selectAll("rect")
        .data(overlayData)
        .join("rect")
        .attr("stroke", "none")
        .attr("fill", "transparent")
        .attr("x", d => d.rect.x)
        .attr("y", d => d.rect.y)
        .attr("width", d => d.rect.width)
        .attr("height", d => d.rect.height)
        .on("mouseover", (event: Event, d) => graphMouseOverHandler(event, d.node))
        .on("mouseleave", (event: Event, d) => graphMouseLeaveHandler(event, d.node))
        .on("click", (event: Event, d) => graphClickHandler(event, d.node))
        .append("title")
        .text(d => d.node.name + (d.node.building === null || d.node.count.isZero() ? "" : `\n${d.node.building.name} × ${spec.format.count(d.node.count)}`))
}

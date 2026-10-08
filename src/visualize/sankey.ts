// SPDX-FileCopyrightText: 2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Renders the visualizer graph as a Sankey diagram.
import * as d3 from "d3"
import type { Item } from "../data/item.ts"
import { one } from "../core/rational.ts"
import { spec } from "../state/factory.ts"
import type { Direction } from "../ui/events.ts"
import { ICON_SIZE } from "../ui/icon.ts"
import { CirclePath, makeCurve } from "./circlepath.ts"
import {
    appendSpriteIcon, colorOf, getColorMaps, measureInGraphTab, renderNodes, renderOverlay, withTestText,
    type BeltLine, type Graph, type GraphEdge, type GraphNode,
} from "./graph.ts"
import { layoutSankey } from "./sankey-layout.ts"

const nodePadding = 36
const sankeyNodeMargin = 2

const columnWidth = 200
const maxNodeHeight = 175

// Distance between a node and a link that loops around it.
const loopClearance = 10
const linkOpacity = 0.3
// Belt lines are drawn only if they are at least this many pixels apart.
const minBeltSpacing = 3
// The item icon of a link label is half as large as other icons.
const linkIconSize = ICON_SIZE / 2

function selfPath(d: GraphEdge): CirclePath {
    const x0 = d.source.x1
    const y0 = d.y0
    const x1 = d.source.x1
    const y1 = d.source.y1 + d.width / 2 + loopClearance
    const x2 = d.target.x0
    const y2 = d.target.y1 + d.width / 2 + loopClearance
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
    const y2a = d.source.y0 - d.width / 2 - loopClearance
    const y2b = d.source.y1 + d.width / 2 + loopClearance
    const y3a = d.target.y0 - d.width / 2 - loopClearance
    const y3b = d.target.y1 + d.width / 2 + loopClearance

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

    const curve = makeCurve(-1, 0, x0, starty, x3, endy, d.width)
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

// Height of a link label, a line of 12px text.
const LABEL_HEIGHT = 14

// Places the rate labels of the links that leave each node, along the node edge. A label that would
// overlap the one before moves on by up to one line; a label that needs more is hidden, and the link's
// tooltip still shows its rate. Returns the label position per link, or null for hidden labels.
function placeLabels(links: readonly GraphEdge[]): Map<GraphEdge, number | null> {
    const positions = new Map<GraphEdge, number | null>()
    const bySource = d3.group(links, link => link.source)
    for (const outgoing of bySource.values()) {
        let last = -Infinity
        for (const link of [...outgoing].sort((a, b) => a.y0 - b.y0)) {
            const y = Math.max(link.y0, last + LABEL_HEIGHT)
            if (y - link.y0 > LABEL_HEIGHT) {
                positions.set(link, null)
            } else {
                positions.set(link, y)
                last = y
            }
        }
    }
    return positions
}

/** Lays out data as a Sankey diagram and renders it into svg#graph. Items in ignore are greyed out. */
export function renderSankey(data: Graph, direction: Direction, ignore: ReadonlySet<Item>): void {
    let maxNodeWidth = 0
    withTestText("sankey test", text => {
        for (const node of data.nodes) {
            node.width = node.labelWidth(text, sankeyNodeMargin)
            maxNodeWidth = Math.max(maxNodeWidth, node.width)
        }
    })

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
            if (dy > minBeltSpacing) {
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
        .attr("stroke-opacity", linkOpacity)
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
        .attr("stroke-opacity", linkOpacity)
        .attr("d", d => d.curve.path())
        .attr("stroke", d => colorOf(itemColors, d.item))
        .attr("stroke-width", 1)

    link.append("title").text(d => `${d.source.name} → ${d.target.name}\n${spec.format.rate(d.rate)}`)

    const labelAt = placeLabels(links)
    const labelY = (d: GraphEdge): number => labelAt.get(d) ?? d.y0

    // The item icon of links from nodes with several products.
    const along = (d: GraphEdge): number => labelY(d) - linkIconSize / 2 - 0.25
    const away = (d: GraphEdge): number => (across ? d.source.y1 : d.source.x1) + 1.75
    const linkIcon = appendSpriteIcon(link.filter(d => d.extra), d => d.item, across ? along : away, across ? away : along, linkIconSize)

    const linkLabel = link.append("text")
        .attr("x", d => d.source.x1 + 2 + (d.extra ? linkIconSize : 0))
        .attr("y", labelY)
        .attr("dy", "0.35em")
        .attr("text-anchor", "start")
        .text(d => (d.extra ? "× " : "") + spec.format.rateWithUnit(d.rate))
    if (across) {
        linkLabel
            .attr("x", null)
            .attr("y", null)
            .attr("transform", d => `translate(${labelY(d)},${d.source.y1 + 2 + (d.extra ? linkIconSize : 0)}) rotate(90)`)
    }
    linkLabel.filter(d => labelAt.get(d) === null).style("display", "none")
    linkIcon.filter(d => labelAt.get(d) === null).style("display", "none")

    const rectElements = svg.selectAll<SVGRectElement, GraphNode>("g.node rect").nodes()
    const boxes = measureInGraphTab(svg, () => new Map(nodes.map((node, i) => {
        const element = rectElements[i]
        if (element === undefined) {
            throw new Error(`missing rect of node ${node.name}`)
        }
        return [node, element.getBBox()]
    })))
    const boxOf = (node: GraphNode): DOMRect => {
        const box = boxes.get(node)
        if (box === undefined) {
            throw new Error(`missing box of node ${node.name}`)
        }
        return box
    }
    renderOverlay(svg, nodes, boxOf, d => d.name + (d.building === null || d.count.isZero() ? "" : `\n${d.building.name} × ${spec.format.count(d.count)}`))
}

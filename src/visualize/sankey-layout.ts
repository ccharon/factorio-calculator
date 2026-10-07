/*Copyright 2015, Mike Bostock
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the author nor the names of contributors may be used to
  endorse or promote products derived from this software without specific prior
  written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.*/
// Sankey layout, adapted from d3-sankey with right-aligned nodes, a fixed column distance and
// reversed links for cycles. It writes the positions into the nodes and edges of the graph.
import * as d3 from "d3"
import type { Graph, GraphEdge, GraphNode } from "./graph.ts"

/** Options of layoutSankey(). */
export interface SankeyOptions {
    /** Width of a node along the flow direction. */
    readonly nodeWidth: number
    /** Space between the nodes of a column. */
    readonly nodePadding: number
    /** Height of the node with the largest flow. */
    readonly maxNodeHeight: number
    /** Space between two columns. */
    readonly linkLength: number
}

const iterations = 6

function ascendingSourceBreadth(a: GraphEdge, b: GraphEdge): number {
    return ascendingBreadth(a.source, b.source) || a.index - b.index
}

function ascendingTargetBreadth(a: GraphEdge, b: GraphEdge): number {
    return ascendingBreadth(a.target, b.target) || a.index - b.index
}

function ascendingBreadth(a: GraphNode, b: GraphNode): number {
    return a.y0 - b.y0
}

function value(d: GraphNode | GraphEdge): number {
    return d.value
}

function get<K>(map: ReadonlyMap<K, number>, key: K): number {
    const v = map.get(key)
    if (v === undefined) {
        throw new Error("missing node")
    }
    return v
}

// Sets the direction of every link so that the forward links form an acyclic graph. Few links
// become backward links, following the greedy feedback arc set heuristic of Eades, Lin and Smyth.
function minFAS({ nodes, links }: Graph): void {
    const remaining = new Set(nodes)
    const indegrees = new Map<GraphNode, number>()
    const outdegrees = new Map<GraphNode, number>()
    for (const node of nodes) {
        indegrees.set(node, node.targetLinks.filter(link => link.source !== node).length)
        outdegrees.set(node, node.sourceLinks.filter(link => link.target !== node).length)
    }

    function remove(node: GraphNode): void {
        remaining.delete(node)
        for (const link of node.targetLinks) {
            if (remaining.has(link.source)) {
                outdegrees.set(link.source, get(outdegrees, link.source) - 1)
            }
        }
        for (const link of node.sourceLinks) {
            if (remaining.has(link.target)) {
                indegrees.set(link.target, get(indegrees, link.target) - 1)
            }
        }
    }

    // Removes nodes with no remaining links in one direction until none are left. Returns whether any was removed.
    function removeAll(degrees: ReadonlyMap<GraphNode, number>, removed: GraphNode[]): boolean {
        let found = false
        for (const node of remaining) {
            if (get(degrees, node) === 0) {
                found = true
                removed.push(node)
                remove(node)
            }
        }
        return found
    }

    const s1: GraphNode[] = []
    const s2: GraphNode[] = []
    while (remaining.size > 0) {
        while (removeAll(outdegrees, s2)) {
            // Sinks go to the end of the order.
        }
        while (removeAll(indegrees, s1)) {
            // Sources go to the start of the order.
        }
        if (remaining.size === 0) {
            break
        }
        let maxDelta: number | null = null
        let maxNode: GraphNode | null = null
        for (const node of remaining) {
            const delta = get(outdegrees, node) - get(indegrees, node)
            if (maxDelta === null || delta > maxDelta) {
                maxDelta = delta
                maxNode = node
            }
        }
        if (maxNode === null) {
            break
        }
        s1.push(maxNode)
        remove(maxNode)
    }

    s2.reverse()
    const orderMap = new Map<GraphNode, number>()
    for (const [i, node] of s1.concat(s2).entries()) {
        orderMap.set(node, i)
    }
    for (const link of links) {
        const i = get(orderMap, link.source)
        const j = get(orderMap, link.target)
        if (i === j) {
            link.direction = "self"
        } else if (i < j) {
            link.direction = "forward"
        } else {
            link.direction = "backward"
        }
    }
}

function computeNodeLinks({ nodes, links }: Graph): void {
    for (const [i, node] of nodes.entries()) {
        node.index = i
        node.sourceLinks = []
        node.targetLinks = []
    }
    for (const [i, link] of links.entries()) {
        link.index = i
        link.source.sourceLinks.push(link)
        link.target.targetLinks.push(link)
    }
}

function computeNodeValues({ nodes }: Graph): void {
    for (const node of nodes) {
        node.value = Math.max(d3.sum(node.sourceLinks, value), d3.sum(node.targetLinks, value))
    }
}

function computeNodeDepths({ nodes }: Graph): void {
    const n = nodes.length
    let current = new Set(nodes)
    let next = new Set<GraphNode>()
    let x = 0
    while (current.size) {
        for (const node of current) {
            node.depth = x
            for (const { target, direction } of node.sourceLinks) {
                if (direction === "forward") {
                    next.add(target)
                }
            }
            for (const { source, direction } of node.targetLinks) {
                if (direction === "backward") {
                    next.add(source)
                }
            }
        }
        if (++x > n) {
            throw new Error("circular link")
        }
        current = next
        next = new Set()
    }
}

function computeNodeHeights({ nodes }: Graph): void {
    const n = nodes.length
    let current = new Set(nodes)
    let next = new Set<GraphNode>()
    let x = 0
    while (current.size) {
        for (const node of current) {
            node.height = x
            for (const { source, direction } of node.targetLinks) {
                if (direction === "forward") {
                    next.add(source)
                }
            }
            for (const { target, direction } of node.sourceLinks) {
                if (direction === "backward") {
                    next.add(target)
                }
            }
        }
        if (++x > n) {
            throw new Error("circular link")
        }
        current = next
        next = new Set()
    }
}

function computeLinkBreadths({ nodes }: Graph): void {
    for (const node of nodes) {
        let y0 = node.y0
        let y1 = y0
        for (const link of node.sourceLinks) {
            link.y0 = y0 + link.width / 2
            y0 += link.width
        }
        for (const link of node.targetLinks) {
            link.y1 = y1 + link.width / 2
            y1 += link.width
        }
    }
}

/**
 * Lays out graph as a Sankey diagram flowing to the right, with every node in the column of
 * its longest path to a sink. Sets the positions and link lists of the nodes and the
 * direction, width and end points of the links. Returns graph.
 */
export function layoutSankey(graph: Graph, { nodeWidth: dx, nodePadding: py, maxNodeHeight: maxHeight, linkLength }: SankeyOptions): Graph {
    function computeNodeLayers({ nodes }: Graph): GraphNode[][] {
        const x = (d3.max(nodes, d => d.depth) ?? -1) + 1
        const kx = dx + linkLength
        const columns: GraphNode[][] = Array.from({ length: x }, () => [])
        for (const node of nodes) {
            const i = Math.max(0, Math.min(x - 1, Math.floor(x - 1 - node.height)))
            node.layer = i
            node.x0 = i * kx
            node.x1 = node.x0 + dx
            columns[i]?.push(node)
        }
        return columns
    }

    function initializeNodeBreadths(columns: readonly GraphNode[][]): number {
        const maxValue = d3.max(columns, c => d3.max(c, value)) ?? 0
        const ky = maxHeight / maxValue
        const y1 = d3.max(columns, c => (c.length - 1) * py + d3.sum(c, value) * ky) ?? 0
        for (const nodes of columns) {
            let y = 0
            for (const node of nodes) {
                node.y0 = y
                node.y1 = y + node.value * ky
                y = node.y1 + py
                for (const link of node.sourceLinks) {
                    link.width = link.value * ky
                }
            }
            y = (y1 - y + py) / (nodes.length + 1)
            for (const [i, node] of nodes.entries()) {
                node.y0 += y * (i + 1)
                node.y1 += y * (i + 1)
            }
            reorderLinks(nodes)
        }
        return y1
    }

    function computeNodeBreadths(graph: Graph): void {
        const columns = computeNodeLayers(graph)
        const y1 = initializeNodeBreadths(columns)
        for (let i = 0; i < iterations; ++i) {
            const alpha = Math.pow(0.99, i)
            const beta = Math.max(1 - alpha, (i + 1) / iterations)
            relaxRightToLeft(columns, alpha, beta, y1)
            relaxLeftToRight(columns, alpha, beta, y1)
        }
    }

    // Reposition each node based on its incoming (target) links.
    function relaxLeftToRight(columns: readonly GraphNode[][], alpha: number, beta: number, y1: number): void {
        for (const column of columns.slice(1)) {
            for (const target of column) {
                let y = 0
                let w = 0
                for (const { source, value } of target.targetLinks) {
                    const v = value * (target.layer - source.layer)
                    y += targetTop(source, target) * v
                    w += v
                }
                if (!(w > 0)) {
                    continue
                }
                const dy = (y / w - target.y0) * alpha
                target.y0 += dy
                target.y1 += dy
                reorderNodeLinks(target)
            }
            column.sort(ascendingBreadth)
            resolveCollisions(column, beta, y1)
        }
    }

    // Reposition each node based on its outgoing (source) links.
    function relaxRightToLeft(columns: readonly GraphNode[][], alpha: number, beta: number, y1: number): void {
        for (const column of columns.slice(0, -1).reverse()) {
            for (const source of column) {
                let y = 0
                let w = 0
                for (const { target, value } of source.sourceLinks) {
                    const v = value * (target.layer - source.layer)
                    y += sourceTop(source, target) * v
                    w += v
                }
                if (!(w > 0)) {
                    continue
                }
                const dy = (y / w - source.y0) * alpha
                source.y0 += dy
                source.y1 += dy
                reorderNodeLinks(source)
            }
            column.sort(ascendingBreadth)
            resolveCollisions(column, beta, y1)
        }
    }

    function resolveCollisions(nodes: readonly GraphNode[], alpha: number, y1: number): void {
        const i = nodes.length >> 1
        const subject = nodes[i]
        if (subject === undefined) {
            return
        }
        resolveCollisionsBottomToTop(nodes, subject.y0 - py, i - 1, alpha)
        resolveCollisionsTopToBottom(nodes, subject.y1 + py, i + 1, alpha)
        resolveCollisionsBottomToTop(nodes, y1, nodes.length - 1, alpha)
        resolveCollisionsTopToBottom(nodes, 0, 0, alpha)
    }

    // Push any overlapping nodes down.
    function resolveCollisionsTopToBottom(nodes: readonly GraphNode[], y: number, start: number, alpha: number): void {
        for (const node of nodes.slice(start)) {
            const dy = (y - node.y0) * alpha
            if (dy > 1e-6) {
                node.y0 += dy
                node.y1 += dy
            }
            y = node.y1 + py
        }
    }

    // Push any overlapping nodes up.
    function resolveCollisionsBottomToTop(nodes: readonly GraphNode[], y: number, start: number, alpha: number): void {
        for (const node of nodes.slice(0, start + 1).reverse()) {
            const dy = (node.y1 - y) * alpha
            if (dy > 1e-6) {
                node.y0 -= dy
                node.y1 -= dy
            }
            y = node.y0 - py
        }
    }

    function reorderNodeLinks({ sourceLinks, targetLinks }: GraphNode): void {
        for (const { source } of targetLinks) {
            source.sourceLinks.sort(ascendingTargetBreadth)
        }
        for (const { target } of sourceLinks) {
            target.targetLinks.sort(ascendingSourceBreadth)
        }
    }

    function reorderLinks(nodes: readonly GraphNode[]): void {
        for (const { sourceLinks, targetLinks } of nodes) {
            sourceLinks.sort(ascendingTargetBreadth)
            targetLinks.sort(ascendingSourceBreadth)
        }
    }

    // Returns the target.y0 that would produce an ideal link from source to target.
    function targetTop(source: GraphNode, target: GraphNode): number {
        let y = source.y0 - (source.sourceLinks.length - 1) * py / 2
        for (const { target: node, width } of source.sourceLinks) {
            if (node === target) {
                break
            }
            y += width + py
        }
        for (const { source: node, width } of target.targetLinks) {
            if (node === source) {
                break
            }
            y -= width
        }
        return y
    }

    // Returns the source.y0 that would produce an ideal link from source to target.
    function sourceTop(source: GraphNode, target: GraphNode): number {
        let y = target.y0 - (target.targetLinks.length - 1) * py / 2
        for (const { source: node, width } of target.targetLinks) {
            if (node === source) {
                break
            }
            y += width + py
        }
        for (const { target: node, width } of source.sourceLinks) {
            if (node === target) {
                break
            }
            y -= width
        }
        return y
    }

    computeNodeLinks(graph)
    computeNodeValues(graph)
    minFAS(graph)
    computeNodeDepths(graph)
    computeNodeHeights(graph)
    computeNodeBreadths(graph)
    computeLinkBreadths(graph)
    return graph
}

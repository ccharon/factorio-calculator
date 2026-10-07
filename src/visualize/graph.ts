/*Copyright 2019-2021 Kirk McDonald
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
// The visualizer graph and the code shared by the Sankey and boxline layouts.
import * as d3 from "d3"
import type { Building } from "../data/building.ts"
import type { Item } from "../data/item.ts"
import { isRecipeLike, Recipe, type RecipeLike, type RecipeNode, type Ingredient } from "../data/recipe.ts"
import type { Rational } from "../core/rational.ts"
import { spec } from "../state/factory.ts"
import type { IconSource } from "../data/icon-source.ts"
import { PX_WIDTH, PX_HEIGHT, spriteSheet } from "../ui/icon.ts"
import type { CirclePath, Point } from "./circlepath.ts"

export const colorList: readonly string[] = [
    "#1f77b4", // blue
    "#8c564b", // brown
    "#2ca02c", // green
    "#d62728", // red
    "#9467bd", // purple
    "#e377c2", // pink
    "#17becf", // cyan
    "#7f7f7f", // gray
    "#bcbd22", // yellow
    "#ff7f0e", // orange
]

export const iconSize = 32
export const colonWidth = 12

/** Direction of a link relative to the node order of the Sankey layout. */
export type LinkDirection = "forward" | "backward" | "self"

/** One belt line drawn inside a wide Sankey link. */
export interface BeltLine {
    readonly item: Item
    readonly curve: CirclePath
}

/** Label of a boxline edge. dagre sets x and y to its center. */
export interface EdgeLabel {
    readonly link: GraphEdge
    readonly labelpos: "c"
    readonly width: number
    readonly height: number
    readonly text: string
    x?: number
    y?: number
    points?: Point[]
}

/** A flow of one item between two nodes of the visualizer graph. */
export class GraphEdge {
    readonly source: GraphNode
    readonly target: GraphNode

    /** Size of the flow for the Sankey layout. */
    readonly value: number

    readonly item: Item
    readonly rate: Rational
    readonly fuel: boolean

    /** Number of belts the flow fills, or null for fluids. */
    readonly beltCount: Rational | null

    /** True if the source has several products, so the link shows its item icon. */
    readonly extra: boolean

    /** SVG elements that are highlighted together with the edge. */
    readonly elements: Element[] = []

    private readonly nodeHighlighters: Set<GraphNode> = new Set()

    // Layout fields, set by the Sankey and boxline layouts.
    index = 0
    width = 0
    y0 = 0
    y1 = 0
    direction: LinkDirection = "forward"
    curve: CirclePath | null = null
    belts: BeltLine[] = []
    points: Point[] = []
    label: EdgeLabel | null = null

    constructor(source: GraphNode, target: GraphNode, value: number, item: Item, rate: Rational, fuel: boolean, beltCount: Rational | null, extra: boolean) {
        this.source = source
        this.target = target
        this.value = value
        this.item = item
        this.rate = rate
        this.fuel = fuel
        this.beltCount = beltCount
        this.extra = extra

        source.links.push(this)
        target.links.push(this)
    }

    /** Highlights the edge on behalf of node. It stays highlighted until every such node unhighlights it. */
    highlight(node: GraphNode): void {
        if (this.nodeHighlighters.size === 0) {
            for (const element of this.elements) {
                element.classList.add("edgePathHighlight")
            }
        }
        this.nodeHighlighters.add(node)
    }

    /** Removes the highlight of node. */
    unhighlight(node: GraphNode): void {
        this.nodeHighlighters.delete(node)
        if (this.nodeHighlighters.size === 0) {
            for (const element of this.elements) {
                element.classList.remove("edgePathHighlight")
            }
        }
    }
}

/** A recipe of the solution, or the solver's output or surplus node, in the visualizer graph. */
export class GraphNode {
    readonly name: string
    readonly ingredients: readonly Ingredient[]
    readonly recipe: RecipeNode
    readonly building: Building | null
    readonly count: Rational

    /** Crafts per second, or null for the output and surplus nodes. */
    readonly rate: Rational | null

    /** Incoming and outgoing edges. A self-loop appears twice. */
    readonly links: GraphEdge[] = []

    /** The main rect of the node, set when it is rendered. */
    element: SVGRectElement | null = null

    // Layout fields, set by the Sankey and boxline layouts.
    index = 0
    width = 0
    labelX = 0
    value = 0
    depth = 0
    height = 0
    layer = 0
    x0 = 0
    x1 = 0
    y0 = 0
    y1 = 0
    sourceLinks: GraphEdge[] = []
    targetLinks: GraphEdge[] = []

    constructor(name: string, recipe: RecipeNode, building: Building | null, count: Rational, rate: Rational | null) {
        this.name = name
        this.ingredients = recipe.getIngredients(spec)
        this.recipe = recipe
        this.building = building
        this.count = count
        this.rate = rate
    }

    /** Returns the label text: the name, the building count, or the rate if there is no building. */
    text(): string {
        if (this.rate === null) {
            return this.name
        } else if (this.count.isZero()) {
            return ` × ${spec.format.rate(this.rate)}/${spec.format.rateName}`
        } else {
            return ` × ${spec.format.count(this.count)}`
        }
    }

    /** Returns the recipe for its icon. Throws for the output and surplus nodes, which have none. */
    icon(): RecipeLike {
        if (!isRecipeLike(this.recipe)) {
            throw new Error(`node without icon: ${this.name}`)
        }
        return this.recipe
    }

    // There are three types of nodes, each of which calculate their width
    // differently:
    //
    // 1) Plain text nodes, used for the "output" and "surplus" nodes. These
    //    are simply the width of the rendered text string, plus a margin on
    //    either side.
    //      [margin] [text] [margin]
    // 2) Rate nodes, which represent the production of an item in lieu of a
    //    building. These consist of:
    //      [margin] [item icon] [text label] [margin]
    // 3) Recipe nodes, which contain a recipe icon, a representation of a
    //    colon (as two circles), a building icon, and a text label:
    //      [margin] [recipe icon] [colon] [building icon] [text] [margin]
    //
    // The constant `iconSize` is the width and height, in SVG coordinate
    // units, of all icons.
    //
    // The constant `colonWidth` is the distance, in SVG coordinate units,
    // between the recipe and building icons; the colon symbol is then centered
    // in this gap.
    //
    // `nodeMargin` is 2 for the Sankey visualization: 1 pixel for the rect
    // border, and one pixel for separation from the border. It is 10 for the
    // boxline visualization, which looks nicer.
    //
    // These calculations hold for both the Sankey and boxline visualizations,
    // with the slight caveat that this is the exact width of each node in the
    // boxline mode, while nodes are of a uniform width in the Sankey diagram,
    // chosen from the maximum node width calculated here.
    /** Returns the width of the node, measured with text, an SVG text element in the document. */
    labelWidth(text: d3.Selection<SVGTextElement, unknown, HTMLElement, unknown>, nodeMargin: number): number {
        text.text(this.text())
        let nodeWidth = measureText(text) + nodeMargin * 2
        if (this.building !== null) {
            nodeWidth += iconSize * 2 + colonWidth
        } else if (this.rate !== null) {
            nodeWidth += iconSize
        }
        return nodeWidth
    }

    /** Highlights the node and its edges. */
    highlight(): void {
        this.element?.classList.add("nodeHighlight")
        for (const edge of this.links) {
            edge.highlight(this)
        }
    }

    /** Removes the highlight of the node and its edges. */
    unhighlight(): void {
        this.element?.classList.remove("nodeHighlight")
        for (const edge of this.links) {
            edge.unhighlight(this)
        }
    }
}

/** The nodes and edges of the visualizer graph. */
export interface Graph {
    readonly nodes: GraphNode[]
    readonly links: GraphEdge[]
}

/** Returns the rendered width of an SVG text element. */
export function measureText(text: d3.Selection<SVGTextElement, unknown, HTMLElement, unknown>): number {
    const node = text.node()
    if (node === null) {
        throw new Error("missing text element")
    }
    return node.getBBox().width
}

let clickedNode: GraphNode | null = null

/** Pins the highlight of a clicked node, or releases it on a second click. */
export function graphClickHandler(_event: Event, node: GraphNode): void {
    if (node === clickedNode) {
        node.unhighlight()
        clickedNode = null
    } else if (clickedNode) {
        clickedNode.unhighlight()
        clickedNode = node
    } else {
        clickedNode = node
    }
}

/** Highlights a node under the mouse. */
export function graphMouseOverHandler(_event: Event, node: GraphNode): void {
    node.highlight()
}

/** Removes the highlight when the mouse leaves a node, unless the node was clicked. */
export function graphMouseLeaveHandler(_event: Event, node: GraphNode): void {
    if (node !== clickedNode) {
        node.unhighlight()
    }
}

function itemNeighbors(item: Item): Set<Item> {
    const touching = new Set<Item>()
    const recipes = item.recipes.concat(item.uses)
    for (const recipe of recipes) {
        const ingredients = recipe.getIngredients(spec).concat(recipe.products)
        for (const ing of ingredients) {
            touching.add(ing.item)
        }
    }
    return touching
}

function itemDegree(item: Item): number {
    return itemNeighbors(item).size
}

/**
 * Assigns color indexes so that neighboring items differ, and gives each node the color of its
 * only product. The indexes are meant to be taken modulo the length of colorList.
 * Returns the item colors and the node colors.
 */
export function getColorMaps(nodes: readonly GraphNode[], links: readonly GraphEdge[]): [Map<Item, number>, Map<RecipeNode, number>] {
    const itemColors = new Map<Item, number>()
    const recipeColors = new Map<RecipeNode, number>()
    const sorted = links.map(link => link.item)
    sorted.sort((a, b) => itemDegree(b) - itemDegree(a))
    const items = new Set(sorted)

    while (items.size > 0) {
        let chosenItem: Item | null = null
        let usedColors = new Set<number>()
        let max = -1
        for (const item of items) {
            const colors = new Set<number>()
            for (const neighbor of itemNeighbors(item)) {
                const color = itemColors.get(neighbor)
                if (color !== undefined) {
                    colors.add(color)
                }
            }
            if (colors.size > max) {
                max = colors.size
                usedColors = colors
                chosenItem = item
            }
        }
        if (chosenItem === null) {
            break
        }
        items.delete(chosenItem)
        let color = 0
        while (usedColors.has(color)) {
            color++
        }
        itemColors.set(chosenItem, color)
    }

    let recipeColor = 0
    for (const node of nodes) {
        const recipe = node.recipe
        const product = recipe.products.length === 1 ? recipe.products[0] : undefined
        const productColor = product === undefined ? undefined : itemColors.get(product.item)
        if (productColor !== undefined) {
            recipeColors.set(recipe, productColor)
        } else {
            recipeColors.set(recipe, recipeColor++)
        }
    }
    return [itemColors, recipeColors]
}

/** Returns the color for a color index from getColorMaps(). */
export function colorOf<K>(colors: ReadonlyMap<K, number>, key: K): string {
    const index = colors.get(key)
    if (index === undefined) {
        throw new Error("missing color")
    }
    return colorList[index % colorList.length] ?? "black"
}

/** Returns the color for a color index from getColorMaps(), darkened. */
export function darkColorOf<K>(colors: ReadonlyMap<K, number>, key: K): string {
    const color = d3.color(colorOf(colors, key))
    if (color === null) {
        throw new Error("invalid color")
    }
    return color.darker().toString()
}

/** Returns the SVG viewBox that shows the icon of obj in the sprite sheet. */
export function imageViewBox(obj: IconSource): string {
    const x1 = obj.icon_col * PX_WIDTH + 0.5
    const y1 = obj.icon_row * PX_HEIGHT + 0.5
    return `${x1} ${y1} ${PX_WIDTH - 1} ${PX_HEIGHT - 1}`
}

/** Returns the URL of the sprite sheet. */
export function spriteSheetURL(): string {
    return `images/sprite-sheet-${spriteSheet().hash}.png`
}

function buildingOf(node: GraphNode): Building {
    if (node.building === null) {
        throw new Error(`node without building: ${node.name}`)
    }
    return node.building
}

// Returns whether node shows the item of an ignored target, which is greyed out.
function isIgnored(node: GraphNode, ignore: ReadonlySet<Item>): boolean {
    const recipe = node.recipe
    const product = recipe.products[0]
    return isRecipeLike(recipe) && recipe.isDisable() && product !== undefined && ignore.has(product.item)
}

/**
 * Renders the laid-out nodes into rects, one group element per node.
 *
 * @param nodeMargin - Space between the rect border and the icons and text.
 * @param justification - "left" places the label at the left edge, "center" in the middle.
 */
export function renderNode(rects: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>, nodeMargin: number, justification: "left" | "center",
    recipeColors: ReadonlyMap<RecipeNode, number>, ignore: ReadonlySet<Item>): void {
    rects.each(d => {
        if (justification === "left") {
            d.labelX = d.x0
        } else {
            d.labelX = (d.x0 + d.x1) / 2 - d.width / 2
        }
    })

    // main rect
    rects.append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("height", d => d.y1 - d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("fill", d => darkColorOf(recipeColors, d.recipe))
        .attr("stroke", d => colorOf(recipeColors, d.recipe))
        .each(function (d) {
            d.element = this
        })
    // plain text node (output, surplus)
    rects.filter(d => d.rate === null)
        .append("text")
        .attr("x", d => (d.x0 + d.x1) / 2)
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(d => d.text())
    const labeledNode = rects.filter(d => d.rate !== null)
    // recipe icon
    labeledNode.append("svg")
        .attr("viewBox", d => imageViewBox(d.icon()))
        .attr("x", d => d.labelX + nodeMargin + 0.5)
        .attr("y", d => (d.y0 + d.y1) / 2 - iconSize / 2 + 0.5)
        .attr("width", iconSize)
        .attr("height", iconSize)
        .append("image")
        .classed("ignore", d => isIgnored(d, ignore))
        .attr("xlink:href", spriteSheetURL())
        .attr("width", spriteSheet().width)
        .attr("height", spriteSheet().height)
    // quality badge of a recipe variant, in the lower left corner of the recipe icon
    const badgeSize = Math.round(iconSize * 0.45)
    const qualityOf = (d: GraphNode): IconSource | null => {
        const recipe = d.icon()
        return recipe instanceof Recipe ? recipe.quality : null
    }
    labeledNode.filter(d => qualityOf(d) !== null).append("svg")
        .attr("viewBox", d => imageViewBox(qualityOf(d) ?? d.icon()))
        .attr("x", d => d.labelX + nodeMargin + 0.5)
        .attr("y", d => (d.y0 + d.y1) / 2 + iconSize / 2 - badgeSize + 0.5)
        .attr("width", badgeSize)
        .attr("height", badgeSize)
        .append("image")
        .attr("xlink:href", spriteSheetURL())
        .attr("width", spriteSheet().width)
        .attr("height", spriteSheet().height)
    // node text (building count, or plain rate if no building)
    labeledNode.append("text")
        .attr("x", d => d.labelX + nodeMargin + iconSize + (d.building === null ? 0 : colonWidth + iconSize))
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("dy", "0.35em")
        .text(d => d.text())
    const buildingNode = rects.filter(d => d.building !== null)
    // colon
    buildingNode.append("circle")
        .classed("colon", true)
        .attr("cx", d => d.labelX + nodeMargin + iconSize + colonWidth / 2)
        .attr("cy", d => (d.y0 + d.y1) / 2 - 4)
        .attr("r", 1)
    buildingNode.append("circle")
        .classed("colon", true)
        .attr("cx", d => d.labelX + nodeMargin + iconSize + colonWidth / 2)
        .attr("cy", d => (d.y0 + d.y1) / 2 + 4)
        .attr("r", 1)
    // building icon
    buildingNode.append("svg")
        .attr("viewBox", d => imageViewBox(buildingOf(d)))
        .attr("x", d => d.labelX + iconSize + colonWidth + nodeMargin + 0.5)
        .attr("y", d => (d.y0 + d.y1) / 2 - iconSize / 2 + 0.5)
        .attr("width", iconSize)
        .attr("height", iconSize)
        .append("image")
        .attr("xlink:href", spriteSheetURL())
        .attr("width", spriteSheet().width)
        .attr("height", spriteSheet().height)
}

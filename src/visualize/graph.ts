// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// The visualizer graph and the code shared by the Sankey and boxline layouts.
import * as d3 from "d3"
import type { Building } from "../data/building.ts"
import type { Item } from "../data/item.ts"
import { isRecipeLike, Recipe, type RecipeLike, type RecipeNode, type Ingredient } from "../data/recipe.ts"
import type { Rational } from "../core/rational.ts"
import { spec } from "../state/factory.ts"
import type { IconSource } from "../data/icon-source.ts"
import { SPRITE_SIZE } from "../data/icon-source.ts"
import { ICON_SIZE, QUALITY_BADGE_RATIO, spriteSheet, spriteSheetURL } from "../ui/icon.ts"
import type { CirclePath, Point } from "./circlepath.ts"

const colorList: readonly string[] = [
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

const colonWidth = 12
// Vertical distance of each colon dot from the middle of the node.
const colonDotOffset = 4

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
            return ` × ${spec.format.rateWithUnit(this.rate)}`
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

    /**
     * Returns the width of the node, measured with text, an SVG text element in the document.
     * Output and surplus nodes hold only text. Nodes without a building add an item icon, and
     * recipe nodes add the recipe icon, a colon and the building icon. The Sankey layout gives all
     * nodes the width of the widest one.
     *
     * @param nodeMargin - Space on each side between the border and the content.
     */
    labelWidth(text: TestText, nodeMargin: number): number {
        text.text(this.text())
        let nodeWidth = measureText(text) + nodeMargin * 2
        if (this.building !== null) {
            nodeWidth += ICON_SIZE * 2 + colonWidth
        } else if (this.rate !== null) {
            nodeWidth += ICON_SIZE
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

/** The svg#graph element of the visualizer tab. */
export type GraphSVG = d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>

/** An SVG text element for measuring text. */
export type TestText = d3.Selection<SVGTextElement, unknown, HTMLElement, unknown>

/** Returns the result of measure, called with a text element in a temporary SVG with the given classes. */
export function withTestText<T>(classes: string, measure: (text: TestText) => T): T {
    const testSVG = d3.select<HTMLElement, unknown>("body").append("svg").classed(classes, true)
    try {
        return measure(testSVG.append("text"))
    } finally {
        testSVG.remove()
    }
}

/**
 * Returns the result of measure, called while the graph tab is shown, because a hidden tab gives
 * empty bounding boxes. The images are hidden meanwhile, so that their sprite sheet does not
 * count into the bounding box of the diagram.
 */
export function measureInGraphTab<T>(svg: GraphSVG, measure: () => T): T {
    const tab = d3.select<HTMLElement, unknown>("#graph_tab")
    const display = tab.style("display")
    tab.style("display", "block")
    svg.selectAll("image").style("display", "none")
    try {
        return measure()
    } finally {
        svg.selectAll("image").style("display", null)
        tab.style("display", display)
    }
}

/** A rectangle in SVG coordinates. */
export interface Box {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
}

/** Covers each node with a transparent rect that takes the mouse events of the node and shows title(node) on hover. */
export function renderOverlay(svg: GraphSVG, nodes: readonly GraphNode[], box: (node: GraphNode) => Box, title: (node: GraphNode) => string): void {
    svg.append("g")
        .classed("overlay", true)
        .selectAll("rect")
        .data(nodes)
        .join("rect")
        .attr("stroke", "none")
        .attr("fill", "transparent")
        .attr("x", d => box(d).x)
        .attr("y", d => box(d).y)
        .attr("width", d => box(d).width)
        .attr("height", d => box(d).height)
        .on("mouseover", graphMouseOverHandler)
        .on("mouseleave", graphMouseLeaveHandler)
        .on("click", graphClickHandler)
        .append("title")
        .text(title)
}

/** Returns the rendered width of an SVG text element. */
export function measureText(text: TestText): number {
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

// Returns the SVG viewBox that shows the icon of obj in the sprite sheet. It leaves out half a
// pixel at each edge, so that neighbouring icons do not bleed in.
function imageViewBox(obj: IconSource): string {
    const x1 = obj.icon_col * SPRITE_SIZE + 0.5
    const y1 = obj.icon_row * SPRITE_SIZE + 0.5
    return `${x1} ${y1} ${SPRITE_SIZE - 1} ${SPRITE_SIZE - 1}`
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
 * Appends to each element of selection an SVG that shows the sprite of source(d) at size pixels,
 * with its top left corner at x(d), y(d). Returns the image elements.
 */
export function appendSpriteIcon<GElement extends d3.BaseType, Datum, PElement extends d3.BaseType, PDatum>(
    selection: d3.Selection<GElement, Datum, PElement, PDatum>,
    source: (d: Datum) => IconSource,
    x: (d: Datum) => number,
    y: (d: Datum) => number,
    size: number,
): d3.Selection<SVGImageElement, Datum, PElement, PDatum> {
    return selection.append("svg")
        .attr("viewBox", d => imageViewBox(source(d)))
        .attr("x", d => x(d) + 0.5)
        .attr("y", d => y(d) + 0.5)
        .attr("width", size)
        .attr("height", size)
        .append<SVGImageElement>("image")
        .attr("href", spriteSheetURL())
        .attr("width", spriteSheet().width)
        .attr("height", spriteSheet().height)
}

/**
 * Renders the laid-out nodes into svg, one group element with a rect per node.
 *
 * @param nodeMargin - Space between the rect border and the icons and text.
 * @param justification - "left" places the label at the left edge, "center" in the middle.
 */
export function renderNodes(svg: GraphSVG, nodes: readonly GraphNode[], nodeMargin: number,
    justification: "left" | "center", recipeColors: ReadonlyMap<RecipeNode, number>, ignore: ReadonlySet<Item>): void {
    const rects = svg.append("g")
        .classed("nodes", true)
        .selectAll<SVGGElement, GraphNode>("g")
        .data(nodes)
        .join("g")
        .classed("node", true)

    rects.each(d => {
        if (justification === "left") {
            d.labelX = d.x0
        } else {
            d.labelX = (d.x0 + d.x1) / 2 - d.width / 2
        }
    })

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
    // Output and surplus nodes show only their name.
    rects.filter(d => d.rate === null)
        .append("text")
        .attr("x", d => (d.x0 + d.x1) / 2)
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(d => d.text())
    const labeledNode = rects.filter(d => d.rate !== null)
    appendSpriteIcon(labeledNode, d => d.icon(), d => d.labelX + nodeMargin, d => (d.y0 + d.y1) / 2 - ICON_SIZE / 2, ICON_SIZE)
        .classed("ignore", d => isIgnored(d, ignore))
    // A recipe variant gets a quality badge in the lower left corner of the recipe icon.
    const badgeSize = Math.round(ICON_SIZE * QUALITY_BADGE_RATIO)
    const qualityOf = (d: GraphNode): IconSource | null => {
        const recipe = d.icon()
        return recipe instanceof Recipe ? recipe.quality : null
    }
    const badged = labeledNode.filter(d => qualityOf(d) !== null)
    appendSpriteIcon(badged, d => qualityOf(d) ?? d.icon(), d => d.labelX + nodeMargin, d => (d.y0 + d.y1) / 2 + ICON_SIZE / 2 - badgeSize, badgeSize)
    labeledNode.append("text")
        .attr("x", d => d.labelX + nodeMargin + ICON_SIZE + (d.building === null ? 0 : colonWidth + ICON_SIZE))
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("dy", "0.35em")
        .text(d => d.text())
    const buildingNode = rects.filter(d => d.building !== null)
    for (const dy of [-colonDotOffset, colonDotOffset]) {
        buildingNode.append("circle")
            .classed("colon", true)
            .attr("cx", d => d.labelX + nodeMargin + ICON_SIZE + colonWidth / 2)
            .attr("cy", d => (d.y0 + d.y1) / 2 + dy)
            .attr("r", 1)
    }
    appendSpriteIcon(buildingNode, buildingOf, d => d.labelX + ICON_SIZE + colonWidth + nodeMargin, d => (d.y0 + d.y1) / 2 - ICON_SIZE / 2, ICON_SIZE)
}

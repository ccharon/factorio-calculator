// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Icons of game objects, with the tooltips that show their details.
import * as d3 from "d3"
import { Rational, zero, one } from "../core/rational.ts"
import { Belt } from "../data/belt.ts"
import { Building, Miner, OffshorePump, PseudoBuilding } from "../data/building.ts"
import { Fuel } from "../data/fuel.ts"
import type { IconSource } from "../data/icon-source.ts"
import { Item } from "../data/item.ts"
import { Module } from "../data/module.ts"
import { Recipe } from "../data/recipe.ts"
import { spec } from "../state/factory.ts"
import { energyString, powerRepr } from "./energy.ts"
import { Icon, getSprite } from "./icon.ts"

type Frame = d3.Selection<HTMLDivElement, undefined, null, undefined>

const hundred = Rational.from_float(100)
const icons = new WeakMap<IconSource, Icon>()

/** Returns the icon of obj, with a tooltip for objects that have details to show. */
export function iconOf(obj: IconSource): Icon {
    let icon = icons.get(obj)
    if (icon === undefined) {
        const tooltip = hasTooltip(obj) ? (): Node => renderTooltip(obj) : null
        const quality = obj instanceof Item || obj instanceof Recipe ? obj.quality : null
        icon = new Icon(obj, tooltip, quality)
        icons.set(obj, icon)
    }
    return icon
}

function hasTooltip(obj: IconSource): boolean {
    return obj instanceof Item || obj instanceof Recipe || obj instanceof Building || obj instanceof Belt || obj instanceof Fuel || obj instanceof Module
}

// Returns the tooltip of obj. Only called for objects where hasTooltip() is true.
function renderTooltip(obj: IconSource): Node {
    if (obj instanceof Item) {
        return renderItemTooltip(obj)
    } else if (obj instanceof Recipe) {
        return renderRecipeTooltip(obj)
    } else if (obj instanceof Building) {
        return renderBuildingTooltip(obj)
    } else if (obj instanceof Belt) {
        const t = header(obj)
        addInline(t, "Max throughput: ", `${spec.format.rate(obj.rate)}/${spec.format.longRate}`)
        return frameNode(t)
    } else if (obj instanceof Fuel) {
        const t = header(obj)
        addInline(t, "Energy: ", energyString(obj.value))
        return frameNode(t)
    } else if (obj instanceof Module) {
        return renderModuleTooltip(obj)
    }
    return new Text(obj.name)
}

function header(obj: IconSource, name: string = obj.name): Frame {
    const t = d3.create("div").classed("frame", true)
    const h = t.append("h3")
    h.append(() => iconOf(obj).make(32, true))
    h.node()?.append(name)
    return t
}

function addLine(t: Frame, label: string, value: string): void {
    const line = t.append("div")
    line.append("b").text(label)
    line.append("span").text(value)
}

function addInline(t: Frame, label: string, value: string): void {
    t.append("b").text(label)
    t.node()?.append(value)
}

function frameNode(t: Frame): HTMLDivElement {
    const node = t.node()
    if (node === null) {
        throw new Error("empty tooltip")
    }
    return node
}

function formatPower(power: Rational): string {
    const { power: value, suffix } = powerRepr(power)
    return `${value.toDecimal(0)} ${suffix}`
}

function percent(x: Rational): string {
    const sign = x.less(zero) ? "" : "+"
    return `${sign}${x.mul(hundred).toDecimal()}%`
}

/**
 * Returns the tooltip of item. Items with a single recipe of the same name show the recipe.
 *
 * @param item
 * @param extra - Optional content appended below the header.
 */
export function renderItemTooltip(item: Item, extra?: Node): HTMLDivElement {
    const only = item.recipes[0]
    if (item.recipes.length === 1 && only !== undefined && only.name === item.name) {
        return renderRecipeTooltip(only, extra)
    }
    const t = header(item)
    if (extra) {
        t.node()?.append(extra)
    }
    return frameNode(t)
}

// Shows products, crafting time and ingredients.
function renderRecipeTooltip(recipe: Recipe, extra?: Node): HTMLDivElement {
    let name = recipe.name
    const first = recipe.products[0]
    if (recipe.products.length === 1 && first !== undefined && first.item.name === recipe.name && one.less(first.amount)) {
        name = `${first.amount.toDecimal()} × ${name}`
    }
    const t = header(recipe, " " + name).classed("recipe", true)
    if (extra) {
        t.node()?.append(extra)
    }
    if (recipe.ingredients.length === 0) {
        return frameNode(t)
    }

    if (recipe.products.length > 1 || first?.item.name !== recipe.name) {
        const productLine = t.append("div")
        productLine.append("span").text("Products:")
        const product = productLine.append("span").selectAll("span").data(recipe.products).join("span")
        product.append("span").text(" ")
        const prodIcon = product.append("div").classed("product", true)
        prodIcon.append(d => iconOf(d.item).make(32, true))
        prodIcon.append("span").classed("count", true).text(d => d.amount.toDecimal())
    }

    const time = t.append("div")
    time.append("div").classed("product", true).append(() => iconOf(getSprite("clock")).make(32, true))
    time.append("span").text(" " + recipe.time.toDecimal())

    const ingredient = t.append("div").selectAll("div").data(recipe.ingredients).join("div")
    ingredient.append("div").classed("product", true).append(d => iconOf(d.item).make(32, true))
    ingredient.append("span").text(d => ` ${d.amount.toDecimal()} × ${d.item.name}`)
    return frameNode(t)
}

// Shows power, speed and module slots. Pseudo-buildings show only their name.
function renderBuildingTooltip(building: Building): HTMLDivElement {
    const t = header(building)
    if (building instanceof PseudoBuilding) {
        return frameNode(t)
    }
    if (building instanceof OffshorePump) {
        addLine(t, "Pumping speed: ", `${spec.format.rate(building.pumpingSpeed)}/${spec.format.rateName}`)
        return frameNode(t)
    }
    addLine(t, "Energy consumption: ", formatPower(building.power))
    if (building instanceof Miner) {
        addLine(t, "Mining speed: ", building.miningSpeed.toDecimal())
    } else {
        addLine(t, "Crafting speed: ", building.speed.toDecimal())
    }
    addLine(t, "Module slots: ", String(building.moduleSlots))
    return frameNode(t)
}

// Shows the effects that are not zero.
function renderModuleTooltip(module: Module): HTMLDivElement {
    const t = header(module)
    const effects: [string, Rational][] = [
        ["Energy consumption: ", module.power],
        ["Speed: ", module.speed],
        ["Productivity: ", module.productivity],
    ]
    for (const [label, value] of effects) {
        if (!value.isZero()) {
            addLine(t, label, percent(value))
        }
    }
    return frameNode(t)
}

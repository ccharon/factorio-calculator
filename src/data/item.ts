// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import type { IconSource } from "./icon-source.ts"
import type { Dataset } from "./dataset.ts"
import type { Quality } from "./quality.ts"
import { DisabledRecipe, ELECTRICITY, HEAT, type Recipe, type RecipeLike } from "./recipe.ts"

/** Item state for the solver: a solid item, a fluid, or an abstract quantity such as reactor cycles. */
export type Phase = "solid" | "fluid" | "abstract"

/** An item or fluid, with the recipes that produce and use it. */
export class Item implements IconSource {
    readonly key: string
    readonly name: string
    readonly phase: Phase

    /** Recipes that produce this item. Filled by the Recipe constructor. */
    readonly recipes: Recipe[] = []

    /** Recipes that use this item. Filled by the Recipe constructor. */
    readonly uses: Recipe[] = []

    readonly icon_col: number
    readonly icon_row: number
    readonly group: string
    readonly subgroup: string
    readonly order: string

    /** Produces the item from nothing when its recipes are disabled or it is ignored. */
    readonly disableRecipe: DisabledRecipe

    /** Weight in grams, or null for fluids and abstract items. */
    readonly weight: number | null

    /** The pseudo item for this item launched into orbit, or null if it cannot be launched. Set by addRocketCargo(). */
    orbit: Item | null = null

    /** For an item in orbit, the item that was launched. Null for all other items. */
    ground: Item | null = null

    /** The quality of a variant, or null for the normal item. */
    readonly quality: Quality | null

    /** The normal item of a variant, or the item itself. */
    readonly base: Item

    /** The variants of higher qualities. Empty for items without quality, such as fluids. */
    readonly variants: Map<Quality, Item> = new Map()

    /**
     * @param weight - Weight in grams, or null for fluids and abstract items.
     * @param base - For a variant: the normal item. The variant has its key and quality.
     */
    constructor(key: string, name: string, col: number, row: number, phase: Phase, group: string, subgroup: string, order: string, weight: number | null = null, base: Item | null = null, quality: Quality | null = null) {
        this.key = key
        this.name = name
        this.phase = phase
        this.icon_col = col
        this.icon_row = row
        this.group = group
        this.subgroup = subgroup
        this.order = order
        this.disableRecipe = new DisabledRecipe(this)
        this.weight = weight
        this.base = base ?? this
        this.quality = quality
    }

    /** Returns this item at quality: a variant, or the normal item for the normal quality and items without quality. */
    variant(quality: Quality): Item {
        return this.base.variants.get(quality) ?? this.base
    }

    /** Creates and registers the variant of this normal item at quality. */
    addVariant(quality: Quality): Item {
        const item = new Item(`${this.key}@${quality.key}`, this.name, this.icon_col, this.icon_row, this.phase, this.group, this.subgroup, this.order, this.weight, this, quality)
        this.variants.set(quality, item)
        return item
    }

    /** Returns the producing recipes plus the DisabledRecipe. */
    allRecipes(): RecipeLike[] {
        return [...this.recipes, this.disableRecipe]
    }

    /** Registers a recipe that produces this item. */
    addRecipe(recipe: Recipe): void {
        this.recipes.push(recipe)
    }

    /** Registers a recipe that uses this item. */
    addUse(recipe: Recipe): void {
        this.uses.push(recipe)
    }
}

/** Creates all items and fluids of the dataset by key, plus the abstract items for electricity and heat. */
export function getItems(data: Dataset): Map<string, Item> {
    const items = new Map<string, Item>()

    for (const d of data.items) {
        const phase: Phase = d.type === "fluid" ? "fluid" : "solid"
        items.set(d.key, new Item(d.key, d.localized_name.en, d.icon_col, d.icon_row, phase, d.group, d.subgroup, d.order, d.weight ?? null))
    }

    const reactor = items.get("nuclear-reactor")
    if (reactor === undefined) {
        throw new Error("dataset lacks the nuclear reactor")
    }

    const electricity = data.sprites.extra["electricity"]
    if (electricity === undefined) {
        throw new Error("dataset lacks the electricity sprite")
    }

    items.set(ELECTRICITY, new Item(ELECTRICITY, electricity.name, electricity.icon_col, electricity.icon_row, "abstract", "production", "energy", "a[electricity]"))

    const heat = data.sprites.extra["heat"]
    if (heat === undefined) {
        throw new Error("dataset lacks the heat sprite")
    }

    items.set(HEAT, new Item(HEAT, heat.name, heat.icon_col, heat.icon_row, "abstract", "production", "energy", "f[nuclear-energy]-d[heat]"))

    return items
}

// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// The solution graph: recipe rates plus the item flows between recipes.

import type { Item } from "../data/item.ts"
import type { RecipeContext, RecipeLike, RecipeNode } from "../data/recipe.ts"
import type { Rational } from "./rational.ts"

/** What Totals needs from the factory state. */
export interface TotalsContext extends RecipeContext {
    /** Returns the enabled recipes that may produce item. */
    getRecipes(item: Item): RecipeLike[]
}

/** A flow of one item from a producing recipe to a consuming recipe. */
export interface ItemLink {
    readonly item: Item
    readonly from: RecipeNode
    readonly to: RecipeNode
    /** Items per second. */
    readonly rate: Rational
    /** True if the consumer burns the item as fuel. */
    readonly fuel: boolean
}

function add<K>(map: Map<K, Rational>, key: K, rate: Rational): void {
    const r = map.get(key)
    map.set(key, r === undefined ? rate : r.add(rate))
}

function set<K1, K2>(map: Map<K1, Map<K2, Rational>>, key1: K1, key2: K2, value: Rational): void {
    let submap = map.get(key1)
    if (submap === undefined) {
        submap = new Map()
        map.set(key1, submap)
    }
    submap.set(key2, value)
}

/**
 * A solution: recipe rates and the item flows between recipes. The graph starts at resource
 * recipes and ignored items and ends at the solver's output and surplus nodes.
 */
export class Totals {
    /** Requested items per second. */
    readonly products: ReadonlyMap<Item, Rational>
    /** Crafts per second of every recipe in the solution. */
    readonly rates: ReadonlyMap<RecipeNode, Rational>
    /** Items produced beyond what the targets need, per second. */
    readonly surplus: ReadonlyMap<Item, Rational>
    /** Producers of last resort that the solver added for cyclic items. */
    readonly extra: ReadonlyMap<Item, RecipeLike>
    /** Total consumption of each item per second. */
    readonly items: Map<Item, Rational> = new Map()
    /** For each item, the producing recipes and their output per second. */
    readonly producers: Map<Item, Map<RecipeNode, Rational>> = new Map()
    /** For each item, the consuming recipes and their input per second. */
    readonly consumers: Map<Item, Map<RecipeNode, Rational>> = new Map()
    /** Item flows, split proportionally between multiple producers and consumers. */
    readonly proportionate: ItemLink[] = []

    constructor(
        context: TotalsContext,
        products: ReadonlyMap<Item, Rational>,
        rates: ReadonlyMap<RecipeNode, Rational>,
        surplus: ReadonlyMap<Item, Rational>,
        extraRecipes: ReadonlyMap<Item, RecipeLike>,
    ) {
        this.products = products
        this.rates = rates
        this.surplus = surplus
        this.extra = extraRecipes

        for (const [recipe, rate] of rates) {
            for (const ing of recipe.getIngredients(context)) {
                const itemRate = rate.mul(ing.amount)
                set(this.consumers, ing.item, recipe, itemRate)
                add(this.items, ing.item, itemRate)
            }
            for (const item of new Set(context.getProducts(recipe).map(ing => ing.item))) {
                set(this.producers, item, recipe, rate.mul(recipe.gives(item, context)))
            }
        }

        for (const [recipe, recipeRate] of rates) {
            const ingredients = recipe.getIngredients(context)
            ingredients.forEach((ing, i) => {
                const totalRate = this.items.get(ing.item)
                if (totalRate === undefined) {
                    return
                }

                const ratio = recipeRate.mul(ing.amount).div(totalRate)
                // Ingredients after the recipe's own list are fuel.
                const fuel = i >= recipe.ingredients.length

                const subRecipes: RecipeLike[] = context.getRecipes(ing.item)
                const extra = extraRecipes.get(ing.item)
                if (extra !== undefined) {
                    subRecipes.push(extra)
                }

                for (const subRecipe of subRecipes) {
                    const subRecipeRate = rates.get(subRecipe)
                    if (subRecipeRate === undefined) {
                        continue
                    }
                    this.proportionate.push({
                        item: ing.item,
                        from: subRecipe,
                        to: recipe,
                        rate: subRecipeRate.mul(subRecipe.gives(ing.item, context)).mul(ratio),
                        fuel,
                    })
                }
            })
        }
    }
}

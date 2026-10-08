// SPDX-FileCopyrightText: 2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Finds recipes that take part in production cycles, such as Kovarex enrichment.

import type { Item } from "../data/item.ts"
import type { RecipeContext, RecipeLike } from "../data/recipe.ts"

/** What cycle detection needs from the factory state. */
export interface CycleContext extends RecipeContext {
    /** Returns the fuel, electricity and heat that the building of recipe uses. */
    getEnergyItems(recipe: RecipeLike): Item[]
    /** Returns the recipes that can produce item, including those that reach its quality. */
    getRecipes(item: Item): RecipeLike[]
}

// Recipes in the set whose building burns item as fuel.
function getFuelConsumers(context: CycleContext, recipes: ReadonlySet<RecipeLike>, item: Item): RecipeLike[] {
    return Array.from(recipes).filter(recipe => context.getEnergyItems(recipe).includes(item))
}

// Returns the recipes in the set that produce an ingredient of recipe, or with invert, that
// use a product of recipe.
function neighboringRecipes(context: CycleContext, recipes: ReadonlySet<RecipeLike>, recipe: RecipeLike, invert: boolean): Set<RecipeLike> {
    const result = new Set<RecipeLike>()
    const itemSet = invert ? context.getProducts(recipe) : recipe.getIngredients(context)
    for (const ing of itemSet) {
        let recipeSet: readonly RecipeLike[]
        if (invert) {
            recipeSet = [...ing.item.uses, ...getFuelConsumers(context, recipes, ing.item)]
        } else {
            recipeSet = context.getRecipes(ing.item)
        }
        for (const neighbor of recipeSet) {
            if (recipes.has(neighbor)) {
                result.add(neighbor)
            }
        }
    }
    return result
}

// Depth-first search. Returns the newly visited recipes in post-order.
function visit(context: CycleContext, recipes: ReadonlySet<RecipeLike>, recipe: RecipeLike, seen: Set<RecipeLike>, invert: boolean): RecipeLike[] {
    if (seen.has(recipe)) {
        return []
    }
    seen.add(recipe)
    const result: RecipeLike[] = []
    for (const neighbor of neighboringRecipes(context, recipes, recipe, invert)) {
        result.push(...visit(context, recipes, neighbor, seen, invert))
    }
    result.push(recipe)
    return result
}

// A single recipe forms a cycle if it uses one of its own products.
function isSelfCycle(context: CycleContext, component: readonly RecipeLike[]): boolean {
    const recipe = component[0]
    if (recipe === undefined) {
        return false
    }
    const products = new Set(context.getProducts(recipe).map(p => p.item))
    return recipe.getIngredients(context).some(ing => products.has(ing.item))
}

/**
 * Returns the recipes that lie on a production cycle within recipes. Uses Kosaraju's algorithm
 * for strongly connected components.
 */
export function getCycleRecipes(context: CycleContext, recipes: ReadonlySet<RecipeLike>): Set<RecipeLike> {
    let seen = new Set<RecipeLike>()
    const order: RecipeLike[] = []
    for (const recipe of recipes) {
        order.push(...visit(context, recipes, recipe, seen, false))
    }

    const result = new Set<RecipeLike>()
    seen = new Set()
    for (const root of order.reverse()) {
        if (seen.has(root)) {
            continue
        }
        const component = visit(context, recipes, root, seen, true)
        if (component.length > 1 || isSelfCycle(context, component)) {
            for (const recipe of component) {
                result.add(recipe)
            }
        }
    }

    return result
}

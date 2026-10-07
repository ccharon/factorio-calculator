/*Copyright 2021 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Finds recipes that take part in production cycles, such as Kovarex enrichment.

import type { Item } from "../data/item.ts"
import type { RecipeContext, RecipeLike } from "../data/recipe.ts"

/** What cycle detection needs from the factory state. */
export interface CycleContext extends RecipeContext {
    /** Returns the fuel, electricity and heat that the building of recipe uses. */
    getEnergyItems(recipe: RecipeLike): Item[]
}

// Recipes in the set whose building burns item as fuel.
function getFuelConsumers(context: CycleContext, recipes: ReadonlySet<RecipeLike>, item: Item): RecipeLike[] {
    return Array.from(recipes).filter(recipe => context.getEnergyItems(recipe).includes(item))
}

// Returns the recipes in the set that produce an ingredient of recipe, or with invert, that
// use a product of recipe.
function neighboringRecipes(context: CycleContext, recipes: ReadonlySet<RecipeLike>, recipe: RecipeLike, invert: boolean): Set<RecipeLike> {
    const result = new Set<RecipeLike>()
    const itemSet = invert ? recipe.products : recipe.getIngredients(context)
    for (const ing of itemSet) {
        let recipeSet: readonly RecipeLike[]
        if (invert) {
            recipeSet = [...ing.item.uses, ...getFuelConsumers(context, recipes, ing.item)]
        } else {
            recipeSet = ing.item.recipes
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
    const products = new Set(recipe.products.map(p => p.item))
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

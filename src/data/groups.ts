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
// Groups of recipes that produce the same items, ordered so that producers come before consumers.

import type { Item } from "./item.ts"
import type { RecipeContext, RecipeLike } from "./recipe.ts"

/** A set of recipes that share at least one product, directly or through other recipes of the set. */
export type RecipeGroup = Set<RecipeLike>

function neighbors(context: RecipeContext, groupMap: ReadonlyMap<RecipeLike, RecipeGroup>, group: RecipeGroup): Set<RecipeGroup> {
    const result = new Set<RecipeGroup>()
    for (const recipe of group) {
        // Reversed, so that ingredients appear in recipe order after the final reverse in topoSort.
        const ingredients = Array.from(recipe.getIngredients(context)).reverse()
        for (const ing of ingredients) {
            for (const subRecipe of ing.item.allRecipes()) {
                const subGroup = groupMap.get(subRecipe)
                if (subGroup !== undefined) {
                    result.add(subGroup)
                }
            }
        }
    }
    result.delete(group)
    return result
}

function visit(context: RecipeContext, groupMap: ReadonlyMap<RecipeLike, RecipeGroup>, group: RecipeGroup, result: Set<RecipeGroup>, seen: Set<RecipeGroup>): void {
    if (result.has(group) || seen.has(group)) {
        return
    }
    seen.add(group)
    for (const g of neighbors(context, groupMap, group)) {
        visit(context, groupMap, g, result, seen)
    }
    seen.delete(group)
    result.add(group)
}

/** Orders recipe groups so that each group comes before the groups that produce its ingredients. Cycles are broken arbitrarily. */
export function topoSort(groups: Iterable<RecipeGroup>, context: RecipeContext): RecipeGroup[] {
    const groupList = Array.from(groups)
    const groupMap = new Map<RecipeLike, RecipeGroup>()
    for (const group of groupList) {
        for (const recipe of group) {
            groupMap.set(recipe, group)
        }
    }

    const result = new Set<RecipeGroup>()
    const seen = new Set<RecipeGroup>()
    for (const group of groupList) {
        visit(context, groupMap, group, result, seen)
    }

    return Array.from(result).reverse()
}

/** Splits recipes into groups of recipes that produce the same items. */
export function getRecipeGroups(recipes: ReadonlySet<RecipeLike>): Set<RecipeGroup> {
    const groups = new Map<RecipeLike, RecipeGroup>()
    const items = new Set<Item>()
    for (const recipe of recipes) {
        if (recipe.products.length > 0) {
            groups.set(recipe, new Set([recipe]))
            for (const ing of recipe.products) {
                items.add(ing.item)
            }
        }
    }

    for (const item of items) {
        const itemRecipes = item.allRecipes().filter(r => recipes.has(r))
        if (itemRecipes.length > 1) {
            const combined: RecipeGroup = new Set()
            for (const recipe of itemRecipes) {
                for (const r of groups.get(recipe) ?? []) {
                    combined.add(r)
                }
            }
            for (const recipe of combined) {
                groups.set(recipe, combined)
            }
        }
    }

    return new Set(groups.values())
}

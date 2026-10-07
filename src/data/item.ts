/*Copyright 2019-2021 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
import type { IconSource } from "./icon-source.ts"
import type { Dataset } from "./dataset.ts"
import { DisabledRecipe, type Recipe, type RecipeLike } from "./recipe.ts"

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

    constructor(key: string, name: string, col: number, row: number, phase: Phase, group: string, subgroup: string, order: string, weight: number | null = null) {
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

/** Creates all items and fluids of the dataset by key, plus the abstract nuclear reactor cycle. */
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
    const cycleKey = "nuclear-reactor-cycle"
    items.set(cycleKey, new Item(
        cycleKey,
        "Nuclear reactor cycle",
        reactor.icon_col,
        reactor.icon_row,
        "abstract",
        "production",
        "energy",
        "f[nuclear-energy]-d[reactor-cycle]",
    ))

    return items
}

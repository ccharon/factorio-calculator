// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Building groups: the sets of buildings that can craft a recipe, each with its selected building.

import type { Building } from "../data/building.ts"
import type { Recipe } from "../data/recipe.ts"

const DEFAULT_BUILDINGS = new Set([
    "assembling-machine-1",
    "electric-furnace",
    "electric-mining-drill",
])

/** Sorts buildings in place from slowest to fastest. */
function buildingSort(buildings: Building[]): void {
    buildings.sort((a, b) => (a.less(b) ? -1 : b.less(a) ? 1 : 0))
}

/** The buildings that can craft a recipe. Recipes with the same buildings share a group and its selected building. */
export class BuildingGroup {
    /** The building keys joined with "+", in the order of the dataset. Identifies the group in the URL. */
    readonly key: string
    /** From slowest to fastest. */
    readonly buildings: Building[]
    /** The category that most recipes of the group list first. The game lists the main category first. */
    readonly primaryCategory: string
    /** The selected building. */
    building: Building

    constructor(buildings: readonly Building[], primaryCategory: string) {
        this.key = buildings.map(b => b.key).join("+")
        this.buildings = Array.from(buildings)
        buildingSort(this.buildings)
        this.primaryCategory = primaryCategory
        this.building = this.getDefault()
    }

    /** Returns the default building among those with the primary category: one of DEFAULT_BUILDINGS, or the slowest. */
    getDefault(): Building {
        const primary = this.buildings.filter(b => b.categories.has(this.primaryCategory))
        const building = primary.find(b => DEFAULT_BUILDINGS.has(b.key)) ?? primary[0] ?? this.buildings[0]
        if (building === undefined) {
            throw new Error("empty building group")
        }
        return building
    }

    /**
     * Returns the building to use where only some buildings work: the selected one if it works,
     * otherwise the next faster one that works, otherwise the fastest one that works, or null.
     */
    getBuilding(works: (building: Building) => boolean): Building | null {
        let b: Building | null = null
        for (const building of this.buildings) {
            if (works(building)) {
                b = building
                if (building === this.building || this.building.less(building)) {
                    return building
                }
            }
        }
        return b
    }
}

/**
 * Groups the recipes by the set of buildings that can craft them. Recipes without a building have no group.
 * Returns the groups by key and the group of each recipe.
 */
export function getBuildingGroups(buildings: readonly Building[], recipes: Iterable<Recipe>): [Map<string, BuildingGroup>, Map<Recipe, BuildingGroup>] {
    const members = new Map<string, Building[]>()
    const firstCategories = new Map<string, Map<string, number>>()
    const recipeKeys = new Map<Recipe, string>()
    for (const recipe of recipes) {
        const [first] = recipe.categories
        if (first === undefined) {
            continue
        }
        const craftable = buildings.filter(b => b.canCraft(recipe))
        if (craftable.length === 0) {
            throw new Error(`no building for recipe ${recipe.key}`)
        }
        const key = craftable.map(b => b.key).join("+")
        members.set(key, craftable)
        recipeKeys.set(recipe, key)
        const counts = firstCategories.get(key) ?? new Map<string, number>()
        counts.set(first, (counts.get(first) ?? 0) + 1)
        firstCategories.set(key, counts)
    }

    const groups = new Map<string, BuildingGroup>()
    for (const [key, craftable] of members) {
        let primary = ""
        let max = 0
        for (const [category, count] of firstCategories.get(key) ?? []) {
            if (count > max) {
                primary = category
                max = count
            }
        }
        groups.set(key, new BuildingGroup(craftable, primary))
    }
    const recipeGroups = new Map<Recipe, BuildingGroup>()
    for (const [recipe, key] of recipeKeys) {
        const group = groups.get(key)
        if (group !== undefined) {
            recipeGroups.set(recipe, group)
        }
    }
    return [groups, recipeGroups]
}

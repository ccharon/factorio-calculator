// SPDX-FileCopyrightText: 2024 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Resource priorities: which raw resources the solver prefers. src/ui/priority-view.ts shows and
// edits them in the Resources tab.

import type { Rational } from "../core/rational.ts"
import type { RecipeLike } from "../data/recipe.ts"

/** Recipe weights of one priority level. Used to build and compare priority lists. */
export type PriorityLevelMap = ReadonlyMap<RecipeLike, Rational>

/** A resource recipe in the priority list with its weight. */
export class Resource {
    readonly recipe: RecipeLike
    weight: Rational

    constructor(recipe: RecipeLike, weight: Rational) {
        this.recipe = recipe
        this.weight = weight
    }
}

/** One priority level: resources the solver treats as equally valuable, weighted among each other. */
export class PriorityLevel {
    readonly resources: Resource[] = []

    /** Returns whether this level contains exactly the recipes and weights of m. */
    equalMap(m: PriorityLevelMap): boolean {
        if (m.size !== this.resources.length) {
            return false
        }
        return this.resources.every(({ recipe, weight }) => m.get(recipe)?.equal(weight) ?? false)
    }

    [Symbol.iterator](): Iterator<Resource> {
        return this.resources[Symbol.iterator]()
    }

    /** Adds resource, sorted by weight. Resources of equal weight keep their order. */
    insertSorted(resource: Resource): void {
        const i = this.resources.findIndex(r => resource.weight.less(r.weight))
        this.resources.splice(i === -1 ? this.resources.length : i, 0, resource)
    }
}

/** The priority levels of all resource recipes, most preferred first. */
export class PriorityList {
    private levels: PriorityLevel[] = []

    /** Creates a priority list with one level per map entry. */
    static fromArray(a: readonly PriorityLevelMap[]): PriorityList {
        const p = new PriorityList()
        for (const m of a) {
            const level = p.addPriorityBefore(null)
            for (const [recipe, weight] of m) {
                p.addRecipe(recipe, weight, level)
            }
        }
        return p
    }

    [Symbol.iterator](): Iterator<PriorityLevel> {
        return this.levels[Symbol.iterator]()
    }

    /** Moves the given recipes into the given levels with the given weights, adding levels and recipes as needed. */
    applyArray(a: readonly PriorityLevelMap[]): void {
        a.forEach((m, i) => {
            while (this.levels.length < i + 1) {
                this.addPriorityBefore(null)
            }
            const level = this.levels[i]
            if (level === undefined) {
                return
            }
            for (const [recipe, weight] of m) {
                const resource = this.getResource(recipe)
                if (resource === null) {
                    this.addRecipe(recipe, weight, level)
                } else {
                    // Empty levels are removed only at the end, so that the indexes of a stay valid.
                    this.detach(resource)
                    resource.weight = weight
                    level.insertSorted(resource)
                }
            }
        })
        this.removeEmptyLevels()
    }

    /** Returns whether the list has exactly these levels, recipes and weights. */
    equalArray(a: readonly PriorityLevelMap[]): boolean {
        return a.length === this.levels.length && a.every((m, i) => this.levels[i]?.equalMap(m) ?? false)
    }

    /** Creates an empty level before level, or at the end if level is null. Returns the new level. */
    addPriorityBefore(level: PriorityLevel | null): PriorityLevel {
        const newLevel = new PriorityLevel()
        const i = level === null ? -1 : this.levels.indexOf(level)
        this.levels.splice(i === -1 ? this.levels.length : i, 0, newLevel)
        return newLevel
    }

    /** Returns the most preferred level, or null if the list is empty. */
    getFirstLevel(): PriorityLevel | null {
        return this.levels[0] ?? null
    }

    /** Returns the least preferred level, or null if the list is empty. */
    getLastLevel(): PriorityLevel | null {
        return this.levels[this.levels.length - 1] ?? null
    }

    /** Adds recipe with weight to level. */
    addRecipe(recipe: RecipeLike, weight: Rational, level: PriorityLevel): void {
        level.insertSorted(new Resource(recipe, weight))
    }

    /** Returns the entry of recipe, or null if the list does not contain it. */
    getResource(recipe: RecipeLike): Resource | null {
        for (const level of this.levels) {
            const resource = level.resources.find(r => r.recipe === recipe)
            if (resource !== undefined) {
                return resource
            }
        }
        return null
    }

    /** Returns the level that contains resource, or null. */
    levelOf(resource: Resource): PriorityLevel | null {
        return this.levels.find(level => level.resources.includes(resource)) ?? null
    }

    /** Removes recipe from the list. An empty level is removed too. */
    removeRecipe(recipe: RecipeLike): void {
        const resource = this.getResource(recipe)
        if (resource !== null) {
            this.detach(resource)
            this.removeEmptyLevels()
        }
    }

    /** Moves resource into level, sorted by weight. A level left empty is removed. */
    moveTo(resource: Resource, level: PriorityLevel): void {
        this.detach(resource)
        level.insertSorted(resource)
        this.removeEmptyLevels()
    }

    /** Moves resource into a new level of its own before level, or at the end if level is null. */
    moveToNewLevel(resource: Resource, level: PriorityLevel | null): void {
        this.moveTo(resource, this.addPriorityBefore(level))
    }

    /** Changes the weight of resource and sorts it into its level again. */
    setWeight(resource: Resource, weight: Rational): void {
        const level = this.levelOf(resource)
        resource.weight = weight
        if (level !== null) {
            this.moveTo(resource, level)
        }
    }

    /**
     * Moves resource one step towards the most preferred end (direction -1) or the least preferred end (1).
     * A resource that shares its level first gets a level of its own, the next step joins the neighbouring level.
     */
    moveStep(resource: Resource, direction: -1 | 1): void {
        const level = this.levelOf(resource)
        if (level === null) {
            return
        }

        const i = this.levels.indexOf(level)
        if (level.resources.length > 1) {
            this.moveToNewLevel(resource, direction === -1 ? level : this.levels[i + 1] ?? null)
        } else {
            const neighbour = this.levels[i + direction]
            if (neighbour !== undefined) {
                this.moveTo(resource, neighbour)
            }
        }
    }

    // Takes resource out of its level and leaves the level in place, even if empty.
    private detach(resource: Resource): void {
        for (const level of this.levels) {
            const i = level.resources.indexOf(resource)
            if (i !== -1) {
                level.resources.splice(i, 1)
            }
        }
    }

    private removeEmptyLevels(): void {
        this.levels = this.levels.filter(level => level.resources.length > 0)
    }
}

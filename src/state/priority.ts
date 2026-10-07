/*Copyright 2024 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Resource priorities: which raw resources the solver prefers. The Resources tab edits them by
// drag and drop.

import * as d3 from "d3"
import { Rational } from "../core/rational.ts"
import type { RecipeLike } from "../data/recipe.ts"
import { spec } from "./factory.ts"

type Div<T> = d3.Selection<HTMLDivElement, T, null, undefined>

/** Recipe weights of one priority level. Used to build and compare priority lists. */
export type PriorityLevelMap = ReadonlyMap<RecipeLike, Rational>

/** A resource recipe in the priority list, with its weight and its element in the Resources tab. */
class Resource {
    level: PriorityLevel | null = null
    readonly recipe: RecipeLike
    weight: Rational
    readonly div: Div<undefined>

    constructor(recipe: RecipeLike, weight: Rational) {
        this.recipe = recipe
        this.weight = weight
        this.div = d3.create("div").classed("resource", true).on("dragstart", () => {
            if (this.level) {
                this.level.list.div.classed("dragging", true)
                this.level.list.dragItem = this
            }
        }).on("dragend", () => {
            this.level?.list.div.classed("dragging", false)
        })
        this.div.append(() => this.recipe.icon.make(48))
        this.div.append("input").attr("type", "text").attr("size", 4).attr("value", this.weight.toString()).on("change", (event: Event) => {
            this.weight = Rational.from_string((event.target as HTMLInputElement).value)
            this.level?.insertSorted(this)
            spec.updateSolution()
        })
    }

    /** Removes this resource from its level. An empty level is removed too. */
    remove(): void {
        const level = this.level
        if (level === null) {
            return
        }
        const i = level.resources.indexOf(this)
        if (i !== -1) {
            level.resources.splice(i, 1)
        }
        this.div.remove()
        if (level.isEmpty()) {
            level.remove()
        }
        this.level = null
    }
}

/** One priority level: resources the solver treats as equally valuable, weighted among each other. */
class PriorityLevel {
    readonly resources: Resource[] = []
    /** Divider element before this level, absent for the first level. */
    middle: Div<PriorityLevel> | null = null
    readonly list: PriorityList
    readonly div: Div<PriorityLevel>

    constructor(list: PriorityList) {
        this.list = list
        this.div = d3.create("div").datum<PriorityLevel>(this).classed("resource-tier", true)
        list.dropTarget(this.div, () => {
            if (list.dragItem && list.dragItem.level !== this) {
                this.insertSorted(list.dragItem)
            }
        })
    }

    [Symbol.iterator](): Iterator<Resource> {
        return this.resources[Symbol.iterator]()
    }

    /** Returns whether this level contains exactly the recipes and weights of m. */
    equalMap(m: PriorityLevelMap): boolean {
        if (m.size !== this.resources.length) {
            return false
        }
        return this.resources.every(({ recipe, weight }) => m.get(recipe)?.equal(weight) ?? false)
    }

    /** Removes this empty level and its divider. Throws if the level is not empty. */
    remove(): void {
        if (this.resources.length !== 0) {
            throw new Error("cannot remove non-empty PriorityLevel")
        }
        this.middle?.remove()
        this.middle = null
        this.div.remove()
        this.list.removeEmptyLevels()
    }

    /** Returns whether the level has no resources. */
    isEmpty(): boolean {
        return this.resources.length === 0
    }

    /** Moves resource into this level, sorted by weight. Its old level is removed if left empty. */
    insertSorted(resource: Resource): void {
        if (resource.level === this && this.resources.length === 1) {
            return
        }
        resource.remove()
        resource.level = this
        const node = this.div.node() as HTMLDivElement
        const resourceNode = resource.div.node() as HTMLDivElement
        for (let i = 0; i < this.resources.length; i++) {
            const r = this.resources[i]
            if (r !== undefined && resource.weight.less(r.weight)) {
                this.resources.splice(i, 0, resource)
                node.insertBefore(resourceNode, r.div.node())
                return
            }
        }
        this.resources.push(resource)
        node.appendChild(resourceNode)
    }
}

/** The priority levels of all resource recipes, rendered into the Resources tab. */
export class PriorityList {
    private priorities: PriorityLevel[] = []
    /** The resource being dragged, or null. */
    dragItem: Resource | null = null
    readonly div: d3.Selection<HTMLElement, unknown, HTMLElement, unknown>

    constructor() {
        this.div = d3.select<HTMLElement, unknown>("#resource_settings")
        this.renderEmpty()
    }

    [Symbol.iterator](): Iterator<PriorityLevel> {
        return this.priorities[Symbol.iterator]()
    }

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

    /** Moves the given recipes into the given levels, adding levels and recipes as needed. */
    applyArray(a: readonly PriorityLevelMap[]): void {
        a.forEach((m, i) => {
            while (this.priorities.length < i + 1) {
                this.addPriorityBefore(null)
            }
            const level = this.priorities[i]
            if (level === undefined) {
                return
            }
            for (const [recipe, weight] of m) {
                const resource = this.getResource(recipe)
                if (resource === null) {
                    this.addRecipe(recipe, weight, level)
                } else {
                    level.insertSorted(resource)
                }
            }
        })
    }

    /** Returns whether the list has exactly these levels, recipes and weights. */
    equalArray(a: readonly PriorityLevelMap[]): boolean {
        return a.length === this.priorities.length && a.every((m, i) => this.priorities[i]?.equalMap(m) ?? false)
    }

    /** Creates a new level before level, or at the end if level is null. Returns the new level. */
    addPriorityBefore(level: PriorityLevel | null): PriorityLevel {
        const listNode = this.div.node() as HTMLElement
        const newLevel = new PriorityLevel(this)
        let successorNode: Node | null = null
        let isFirst = false
        if (level === null) {
            this.priorities.push(newLevel)
            successorNode = listNode.lastChild
            isFirst = this.priorities.length === 1
        } else {
            const i = this.priorities.indexOf(level)
            if (i !== -1) {
                this.priorities.splice(i, 0, newLevel)
                isFirst = i === 0
                successorNode = isFirst ? level.div.node() : level.middle?.node() ?? null
            }
        }
        if (!isFirst) {
            newLevel.middle = this.makeMiddle(newLevel)
            listNode.insertBefore(newLevel.middle.node() as HTMLDivElement, successorNode)
        }
        listNode.insertBefore(newLevel.div.node() as HTMLDivElement, successorNode)
        if (isFirst && level !== null) {
            level.middle = this.makeMiddle(level)
            listNode.insertBefore(level.middle.node() as HTMLDivElement, successorNode)
        }
        return newLevel
    }

    /** Returns the most preferred level, or null if the list is empty. */
    getFirstLevel(): PriorityLevel | null {
        return this.priorities[0] ?? null
    }

    /** Returns the least preferred level, or null if the list is empty. */
    getLastLevel(): PriorityLevel | null {
        return this.priorities[this.priorities.length - 1] ?? null
    }

    /** Adds recipe with weight to level. */
    addRecipe(recipe: RecipeLike, weight: Rational, level: PriorityLevel): void {
        level.insertSorted(new Resource(recipe, weight))
    }

    /** Returns the entry of recipe, or null if the list does not contain it. */
    getResource(recipe: RecipeLike): Resource | null {
        for (const level of this.priorities) {
            for (const resource of level.resources) {
                if (resource.recipe === recipe) {
                    return resource
                }
            }
        }
        return null
    }

    /** Removes recipe from the list. */
    removeRecipe(recipe: RecipeLike): void {
        this.getResource(recipe)?.remove()
    }

    /** Removes all levels and renders the two end markers. */
    renderEmpty(): void {
        this.div.selectAll("*").remove()
        const less = this.div.append("div").classed("resource-tier bookend", true)
        this.dropTarget(less, () => {
            if (this.dragItem) {
                this.addPriorityBefore(this.priorities[0] ?? null).insertSorted(this.dragItem)
            }
        })
        less.append("span").text("less valuable")
        const more = this.div.append("div").classed("resource-tier bookend", true)
        this.dropTarget(more, () => {
            if (this.dragItem) {
                this.addPriorityBefore(null).insertSorted(this.dragItem)
            }
        })
        more.append("span").text("more valuable")
    }

    /** Drops empty levels and removes the divider before the new first level. */
    removeEmptyLevels(): void {
        const newLevels = this.priorities.filter(level => !level.isEmpty())
        const first = newLevels[0]
        if (first?.middle) {
            first.middle.remove()
            first.middle = null
        }
        this.priorities = newLevels
    }

    /** Makes selection accept dropped resources. drop runs on a drop, then the solution updates. */
    dropTarget<T>(selection: d3.Selection<HTMLDivElement, T, HTMLElement | null, unknown>, drop: () => void): void {
        selection.on("dragover", (event: DragEvent) => {
            event.preventDefault()
        }).on("dragenter", (event: DragEvent) => {
            (event.currentTarget as HTMLElement).classList.add("highlight")
        }).on("dragleave", (event: DragEvent) => {
            if (event.target === event.currentTarget) {
                (event.currentTarget as HTMLElement).classList.remove("highlight")
            }
        }).on("drop", (event: DragEvent) => {
            if (this.dragItem === null) {
                return
            }
            event.preventDefault()
            ;(event.currentTarget as HTMLElement).classList.remove("highlight")
            drop()
            this.dragItem = null
            spec.updateSolution()
        })
    }

    // Creates the divider placed before level.
    private makeMiddle(level: PriorityLevel): Div<PriorityLevel> {
        const middle = d3.create("div").datum(level).classed("middle", true)
        this.dropTarget(middle, () => {
            if (this.dragItem) {
                this.addPriorityBefore(level).insertSorted(this.dragItem)
            }
        })
        return middle
    }
}

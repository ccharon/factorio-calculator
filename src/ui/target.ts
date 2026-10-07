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
import * as d3 from "d3"
import { Rational, zero, one } from "../core/rational.ts"
import type { ItemGroups } from "../data/group.ts"
import type { Item } from "../data/item.ts"
import type { Recipe } from "../data/recipe.ts"
import { spec } from "../state/factory.ts"
import { addInputs, makeDropdown } from "./dropdown.ts"

const SELECTED_INPUT = "selected"

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

// Clears the search field of an item dropdown and shows all items again.
function resetSearch(dropdown: HTMLElement): void {
    const search = dropdown.querySelector<HTMLInputElement>("input.search")
    if (search) {
        search.value = ""
    }
    for (const elem of dropdown.querySelectorAll<HTMLElement>("label, hr")) {
        elem.style.display = ""
    }
}

// Filters the item dropdown by the search text. Enter selects the item if exactly one matches.
function searchTargets(event: KeyboardEvent): void {
    const search = event.currentTarget as HTMLInputElement
    const container = search.parentElement
    if (container === null) {
        return
    }

    const searchText = normalize(search.value)
    if (!searchText) {
        resetSearch(container)
        return
    }

    const dropdown = d3.select(container)
    if (event.key === "Enter") {
        const visible = dropdown.selectAll<HTMLLabelElement, Item>("label").filter(function () {
            return this.style.display !== "none"
        })
        if (visible.size() === 1) {
            const input = document.getElementById(visible.attr("for"))
            if (input instanceof HTMLInputElement) {
                input.checked = true
                input.dispatchEvent(new Event("change"))
            }
        }
        return
    }

    // Hides non-matching items, and dividers of groups without visible items.
    let currentHrHasContent = false
    let lastHrWithContent: HTMLElement | null = null
    for (const node of dropdown.selectAll<HTMLElement, Item | undefined>("hr, label").nodes()) {
        if (node.tagName === "HR") {
            node.style.display = currentHrHasContent ? "" : "none"
            if (currentHrHasContent) {
                lastHrWithContent = node
            }
            currentHrHasContent = false
        } else {
            const item = d3.select<HTMLElement, Item | undefined>(node).datum()
            const matches = item !== undefined && normalize(item.name).includes(searchText)
            node.style.display = matches ? "" : "none"
            currentHrHasContent ||= matches
        }
    }

    if (!currentHrHasContent && lastHrWithContent !== null) {
        lastHrWithContent.style.display = "none"
    }
}

let targetCount = 0
let recipeSelectorCount = 0

/**
 * A build target: an item with a rate or a building count, shown as a row of controls at the
 * top of the page. Exactly one of rate and building count is the input; the other is computed.
 */
export class BuildTarget {
    /** Position in spec.buildTargets. */
    index: number
    itemKey: string
    item: Item
    /** Recipe chosen for the building count, when the item has several recipes. */
    recipe: Recipe | null = null
    /** First recipe offered, which the URL leaves out. */
    defaultRecipe: Recipe | null = null
    /** True if the building count is the input, false if the rate is. */
    changedBuilding = true
    buildings: Rational = one
    /** Items per second. */
    rate: Rational = zero
    readonly element: HTMLLIElement
    readonly buildingLabel: HTMLLabelElement
    readonly buildingInput: HTMLInputElement
    readonly rateLabel: HTMLLabelElement
    readonly rateInput: HTMLInputElement
    private readonly recipeSelector: d3.Selection<HTMLSpanElement, undefined, null, undefined>

    constructor(index: number, itemKey: string, item: Item, itemGroups: ItemGroups) {
        this.index = index
        this.itemKey = itemKey
        this.item = item

        const element = d3.create("li").classed("target", true)
        element.append("button").classed("targetButton ui", true).text("x").attr("title", "Remove this item.").on("click", () => {
            spec.removeTarget(this)
            spec.updateSolution()
        })
        this.element = element.node() as HTMLLIElement

        const dropdown = makeDropdown(
            element,
            d => (d.select<HTMLInputElement>(".search").node())?.focus(),
            d => {
                const node = d.node()
                if (node) {
                    resetSearch(node)
                }
            },
        )
        dropdown.classed("itemDropdown", true)
        dropdown.append("input").classed("search", true).attr("placeholder", "Search").on("keyup", searchTargets)
        const group = dropdown.selectAll<HTMLDivElement, Item[][]>("div").data(itemGroups).join("div")
        group.filter((_d, i) => i > 0).append("hr")
        const items = group.selectAll<HTMLDivElement, Item[]>("div").data(d => d).join("div").selectAll<HTMLSpanElement, Item>("span").data(d => d).join("span")
        const itemLabel = addInputs(items, `target-${targetCount}`, d => d === item, chosen => {
            this.itemKey = chosen.key
            this.item = chosen
            this.displayRecipes()
            spec.updateSolution()
        })
        const dropdownNode = dropdown.node() ?? undefined
        itemLabel.append(d => d.icon.make(32, false, dropdownNode))
        targetCount++

        this.buildingLabel = element.append("label").classed(SELECTED_INPUT, true).text(" Buildings: ").node() as HTMLLabelElement

        this.recipeSelector = element.append("span")

        const buildingTitle = "Enter a value to specify the number of buildings. "
            + "The rate will be determined based on the number of items a single building can make."
        const buildingInput = element.append("input").attr("type", "text").attr("value", 1).attr("size", 3).attr("title", buildingTitle)
        buildingInput.on("change", () => {
            this.buildingsChanged()
            spec.updateSolution()
        })
        this.buildingInput = buildingInput.node() as HTMLInputElement

        this.rateLabel = element.append("label").node() as HTMLLabelElement
        this.setRateLabel()

        const rateTitle = "Enter a value to specify the rate. The number of buildings will be determined based on the rate."
        const rateInput = element.append("input").attr("type", "text").attr("value", "").attr("size", 5).attr("title", rateTitle)
        rateInput.on("change", () => {
            this.rateChanged()
            spec.updateSolution()
        })
        this.rateInput = rateInput.node() as HTMLInputElement

        this.displayRecipes()
    }

    /** Updates the rate label to the displayed time unit. */
    setRateLabel(): void {
        this.rateLabel.textContent = ` Items/${spec.format.longRate}: `
    }

    /** Offers the enabled recipes that produce the item on net. A dropdown appears only for more than one. */
    displayRecipes(): void {
        this.recipeSelector.selectAll("*").remove()

        const recipes = spec.ignore.has(this.item)
            ? []
            : this.item.recipes.filter(recipe => !spec.disable.has(recipe) && recipe.isNetProducer(this.item))
        if (this.recipe === null || !recipes.includes(this.recipe)) {
            this.recipe = null
        }

        const first = recipes[0]
        this.defaultRecipe = first ?? null
        if (first === undefined) {
            return
        }
        if (recipes.length === 1) {
            this.recipe = first
            return
        }

        this.recipe ??= first
        const dropdown = makeDropdown(this.recipeSelector)
        const inputs = dropdown.selectAll<HTMLDivElement, Recipe>("div").data(recipes).join("div")
        const labels = addInputs(inputs, `target-recipe-${recipeSelectorCount}`, d => this.recipe === d, d => {
            this.recipe = d
            spec.updateSolution()
        })

        const dropdownNode = dropdown.node() ?? undefined
        labels.append(d => d.icon.make(32, false, dropdownNode))
        recipeSelectorCount++
        this.recipeSelector.append("span").text(" \u00d7 ")
    }

    /** Returns the target rate in items per second and updates the computed input field. */
    getRate(): Rational {
        this.setRateLabel()
        const recipe = this.recipe
        if ((recipe === null || spec.getBuilding(recipe) === null) && this.changedBuilding) {
            this.rateChanged()
        }

        let baseRate: Rational | null = null
        if (recipe !== null) {
            baseRate = spec.getRecipeRate(recipe)?.mul(recipe.gives(this.item)) ?? null
        }

        if (this.changedBuilding && baseRate !== null) {
            const rate = baseRate.mul(this.buildings)
            this.rateInput.value = spec.format.rate(rate)
            return rate
        }

        this.buildingInput.value = baseRate === null ? "N/A" : spec.format.count(this.rate.div(baseRate))
        this.rateInput.value = spec.format.rate(this.rate)
        return this.rate
    }

    /** Makes the building count the input, read from its field. */
    buildingsChanged(): void {
        this.changedBuilding = true
        this.buildingLabel.classList.add(SELECTED_INPUT)
        this.rateLabel.classList.remove(SELECTED_INPUT)
        this.buildings = Rational.from_string(this.buildingInput.value)
        this.rate = zero
        this.rateInput.value = ""
    }

    /** Sets a building count, optionally for a specific recipe. */
    setBuildings(count: string, recipe: Recipe | null): void {
        this.buildingInput.value = count
        this.recipe = recipe
        this.buildingsChanged()
    }

    /** Makes the rate the input, read from its field in the displayed time unit. */
    rateChanged(): void {
        this.changedBuilding = false
        this.buildingLabel.classList.remove(SELECTED_INPUT)
        this.rateLabel.classList.add(SELECTED_INPUT)
        this.buildings = zero
        this.rate = Rational.from_string(this.rateInput.value).div(spec.format.rateFactor)
        this.buildingInput.value = ""
    }

    /** Sets a rate in the displayed time unit. */
    setRate(rate: string): void {
        this.rateInput.value = rate
        this.rateChanged()
    }
}

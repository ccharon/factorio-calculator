/*Copyright 2019-2021 Kirk McDonald
Copyright 2026 Christian Charon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// The factory table: one row per recipe of the solution, grouped by shared products, with
// rates, belts, buildings, modules, beacons, power and a usage breakdown per item.

import * as d3 from "d3"
import { Rational, zero, one } from "../core/rational.ts"
import type { Totals } from "../core/totals.ts"
import type { Building } from "../data/building.ts"
import type { Fuel } from "../data/fuel.ts"
import { getRecipeGroups, topoSort } from "../data/groups.ts"
import type { Item } from "../data/item.ts"
import { type Module, type ModuleSpec, moduleRows } from "../data/module.ts"
import { ELECTRICITY, ELECTRICITY_UNIT, HEAT, type RecipeLike, type RecipeNode, isRecipeLike } from "../data/recipe.ts"
import type { FactorySpecification } from "../state/factory.ts"
import { spec } from "../state/factory.ts"
import { formatSettings } from "../state/fragment.ts"
import { powerRepr } from "./energy.ts"
import { toggleIgnoreHandler } from "./events.ts"
import type { IconSource } from "../data/icon-source.ts"
import { Icon } from "./icon.ts"
import { type ModuleCell, type ModuleInput as DropdownInput, moduleDropdown } from "./module-dropdown.ts"
import { iconOf, renderItemTooltip } from "./icons.ts"

const hundred = Rational.from_float(100)

function alignPower(x: Rational): string {
    const { power, suffix } = powerRepr(x)
    return `${spec.format.alignCount(power)} ${suffix}`
}

// Returns the rate of item for the table. Electricity and heat show as power.
function alignItemRate(item: Item, rate: Rational): string {
    return item.key === ELECTRICITY || item.key === HEAT ? alignPower(rate.mul(ELECTRICITY_UNIT)) : spec.format.alignRate(rate)
}

function rateOf<K>(map: ReadonlyMap<K, Rational> | undefined, key: K): Rational {
    return map?.get(key) ?? zero
}

interface Header {
    readonly text: string
    readonly colspan: number
    readonly surplus: boolean
}

/** One line of an item's breakdown: an ingredient flow into a producer, or the item's flow into a consumer. */
interface BreakdownRow {
    readonly item: Item
    readonly recipe: RecipeNode & IconSource
    /** Items per second. */
    readonly rate: Rational
    readonly building: Building | null
    readonly count: Rational | null
    /** Share of the item's consumption, such as "25%", or null for ingredient rows. */
    readonly percent: string | null
    /** True for the first consumer row, which gets a divider above it. */
    readonly divider: boolean
}

// Rows for the breakdown of item: first every ingredient of the recipes producing it, then
// every recipe consuming it. Building counts appear where a single recipe is involved.
function getBreakdown(item: Item, totals: Totals): BreakdownRow[] {
    const rows: BreakdownRow[] = []
    let found = false
    for (const recipe of item.recipes) {
        if (!totals.rates.has(recipe)) {
            continue
        }
        for (const ing of recipe.getIngredients(spec)) {
            const rate = rateOf(totals.consumers.get(ing.item), recipe)
            let building: Building | null = null
            let count: Rational | null = null
            const producers = totals.producers.get(ing.item)
            const [only] = producers?.keys() ?? []
            if (producers?.size === 1 && only !== undefined) {
                building = spec.getBuilding(only)
                count = spec.getCount(only, rate.div(only.gives(ing.item, spec)))
            }
            rows.push({ item: ing.item, recipe, rate, building, count, percent: null, divider: false })
            found = true
        }
    }

    const producers = totals.producers.get(item)
    const [singleRecipe] = producers?.size === 1 ? producers.keys() : []
    const building = singleRecipe === undefined ? null : spec.getBuilding(singleRecipe)
    for (const [recipe, rate] of totals.consumers.get(item) ?? []) {
        if (!isRecipeLike(recipe)) {
            continue
        }
        const count = singleRecipe === undefined ? null : spec.getCount(singleRecipe, rate.div(singleRecipe.gives(item, spec)))
        const percent = rate.div(rateOf(totals.items, item)).mul(hundred)
        const percentStr = percent.less(one) ? "<1%" : `${percent.toDecimal(0)}%`
        rows.push({ item, recipe, rate, building, count, percent: percentStr, divider: found })
        found = false
    }

    return rows
}

// Re-renders after a module change. Productivity changes and building-count targets need a new solution.
function moduleChanged(recipe: RecipeNode, needsSolve: boolean): void {
    if (needsSolve || spec.isFactoryTarget(recipe)) {
        spec.updateSolution()
    } else {
        spec.display()
    }
}

/** A choice in a module slot dropdown. */
class ModuleInput implements DropdownInput {
    readonly cell: ModuleSlot
    readonly module: Module | null

    constructor(cell: ModuleSlot, module: Module | null) {
        this.cell = cell
        this.module = module
    }

    /** Returns whether the slot holds this module. */
    checked(): boolean {
        return this.cell.moduleSpec.getModule(this.cell.index) === this.module
    }

    /** Puts the module into the slot. Choosing for the first slot also changes the slots that held the same module. */
    choose(): void {
        const modules = this.cell.moduleSpec.modules
        const toUpdate = [this.cell.index]
        if (this.cell.index === 0) {
            const oldModule = modules[0]
            for (let i = 1; i < modules.length; i++) {
                if (modules[i] === oldModule) {
                    toUpdate.push(i)
                }
            }
        }

        let anyRecalc = false
        for (const i of toUpdate) {
            anyRecalc = this.cell.moduleSpec.setModule(i, this.module) || anyRecalc
        }

        moduleChanged(this.cell.moduleSpec.recipe, anyRecalc)
    }
}

let slotCount = 0

/** The dropdown of one module slot. */
class ModuleSlot implements ModuleCell {
    readonly name: string = `moduleslot-${slotCount++}`
    readonly moduleSpec: ModuleSpec
    readonly index: number
    readonly inputRows: ModuleInput[][]

    constructor(moduleSpec: ModuleSpec, index: number) {
        this.moduleSpec = moduleSpec
        this.index = index
        const usable = (module: Module | null): boolean => module === null || module.canUse(moduleSpec.recipe)
        this.inputRows = moduleRows.map(row => row.filter(usable).map(module => new ModuleInput(this, module)))
    }
}

/** A choice in a beacon slot dropdown. */
class BeaconInput implements DropdownInput {
    readonly cell: BeaconCell
    readonly module: Module | null

    constructor(cell: BeaconCell, module: Module | null) {
        this.cell = cell
        this.module = module
    }

    /** Returns whether the beacon slot holds this module. */
    checked(): boolean {
        return this.module === this.cell.moduleSpec.beaconModules[this.cell.index]
    }

    /** Puts the module into the beacon slot. Choosing for the first slot also changes the second if both were equal. */
    choose(): void {
        const modules = this.cell.moduleSpec.beaconModules
        if (this.cell.index === 0 && modules[0] === modules[1]) {
            this.cell.moduleSpec.setBeaconModule(this.module, 1)
        }
        this.cell.moduleSpec.setBeaconModule(this.module, this.cell.index)
        moduleChanged(this.cell.moduleSpec.recipe, false)
    }
}

let beaconCount = 0

/** The dropdown of one beacon module slot. */
class BeaconCell implements ModuleCell {
    readonly name: string = `beaconslot-${beaconCount++}`
    readonly moduleSpec: ModuleSpec
    readonly index: 0 | 1
    readonly inputRows: BeaconInput[][]

    constructor(moduleSpec: ModuleSpec, index: 0 | 1) {
        this.moduleSpec = moduleSpec
        this.index = index
        const beaconable = (module: Module | null): boolean => module === null || module.canBeacon()
        const rows = moduleRows.map(row => row.filter(beaconable).map(module => new BeaconInput(this, module)))
        this.inputRows = rows.filter(row => row.length > 0)
    }
}

/** One row of the factory table: an item, the recipe in the same row, or both. */
interface DisplayRow {
    readonly item: Item | null
    readonly recipe: RecipeLike | null
    readonly building: Building | null
    readonly moduleSpec: ModuleSpec | null
    readonly slots: ModuleSlot[]
    readonly beaconModules: BeaconCell[]
    /** True if the item and the recipe have the same key, so the recipe icon is not repeated. */
    readonly single: boolean
    readonly breakdown: BreakdownRow[] | null
}

/** Rows for one group of recipes that share products. */
interface DisplayGroup {
    readonly rows: DisplayRow[]
}

function makeRow(totals: Totals, item: Item | null, recipe: RecipeLike | null): DisplayRow {
    const building = recipe === null ? null : spec.getBuilding(recipe)
    const moduleSpec = recipe !== null && building?.canBeacon() ? spec.getModuleSpec(recipe) ?? null : null
    return {
        item,
        recipe,
        building,
        moduleSpec,
        slots: moduleSpec?.modules.map((_, j) => new ModuleSlot(moduleSpec, j)) ?? [],
        beaconModules: moduleSpec ? [new BeaconCell(moduleSpec, 0), new BeaconCell(moduleSpec, 1)] : [],
        single: item !== null && recipe !== null && item.key === recipe.key,
        breakdown: item === null ? null : getBreakdown(item, totals),
    }
}

// Groups the solution's recipes by shared products, ordered from final products to raw resources.
function getDisplayGroups(totals: Totals): DisplayGroup[] {
    const recipes = Array.from(totals.rates.keys()).filter(isRecipeLike).reverse()
    return topoSort(getRecipeGroups(new Set(recipes)), spec).map(group => {
        const items = new Set<Item>()
        for (const recipe of group) {
            for (const ing of recipe.products) {
                if (totals.items.has(ing.item)) {
                    items.add(ing.item)
                }
            }
        }
        const itemList = [...items]
        const recipeList = [...group]
        if (itemList.length === 0) {
            return { rows: [] }
        }
        const len = Math.max(itemList.length, recipeList.length)
        return { rows: Array.from({ length: len }, (_, i) => makeRow(totals, itemList[i] ?? null, recipeList[i] ?? null)) }
    })
}

function toggleBreakdownHandler(event: Event): void {
    const row = (event.currentTarget as HTMLElement).parentElement
    const bdRow = row?.nextElementSibling
    if (!row || !bdRow) {
        return
    }
    const open = !row.classList.contains("breakdown-open")
    row.classList.toggle("breakdown-open", open)
    bdRow.classList.toggle("breakdown-open", open)
}

// Returns the icon of a table row item. Its tooltip adds a hint about ignoring the item.
function itemRowIcon(item: Item, hint: string): HTMLImageElement {
    return new Icon(item, () => renderItemTooltip(item, d3.create("span").text(hint).node() ?? undefined)).make(32)
}

function pipeIcon(): HTMLImageElement {
    const pipe = spec.items.get("pipe")
    if (pipe === undefined) {
        throw new Error("dataset lacks the pipe")
    }
    return new Icon({ name: pipe.name, icon_col: pipe.icon_col, icon_row: pipe.icon_row }).make(32)
}

// Appends an SVG icon from images/icons.svg. size is width and height of the viewBox.
function svgIcon<P extends d3.BaseType, D, PP extends d3.BaseType, PD>(
    parent: d3.Selection<P, D, PP, PD>, className: string, size: [number, number], href: string,
): void {
    const [width, height] = size
    const svg = parent.append("svg").classed(className, true).attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height)
    svg.append("use").attr("href", href)
}

// Accessors for rows that a filter has already restricted to non-null values.
function itemOf(d: DisplayRow): Item {
    if (d.item === null) {
        throw new Error("row without item")
    }
    return d.item
}

function recipeOf(d: DisplayRow): RecipeLike {
    if (d.recipe === null) {
        throw new Error("row without recipe")
    }
    return d.recipe
}

function fuelOf(d: DisplayRow): Fuel {
    const category = buildingOf(d).fuel
    if (category === null) {
        throw new Error("row without fuel")
    }
    return spec.getFuel(category)
}

function buildingOf(d: { readonly building: Building | null }): Building {
    if (d.building === null) {
        throw new Error("row without building")
    }
    return d.building
}

type RowSelection = d3.Selection<HTMLTableRowElement, DisplayRow, HTMLTableSectionElement, DisplayGroup>

// Creates the cells of new table rows. Updates fill them in.
function createRow(enter: d3.Selection<d3.EnterElement, DisplayRow, HTMLTableSectionElement, DisplayGroup>): RowSelection {
    const row = enter.append("tr").classed("display-row", true)
    svgIcon(row.append("td").classed("item", true).on("click", toggleBreakdownHandler), "breakdown-arrow", [16, 16], "images/icons.svg#right")
    row.append("td").classed("item item-icon", true)
    row.append("td").classed("item right-align", true).append("tt").classed("item-rate", true)
    row.append("td").classed("item surplus right-align", true).append("tt").classed("surplus-rate", true)
    row.append("td").classed("item pad belt-icon", true)
    row.append("td").classed("item right-align belt-count-cell pad-right", true).append("tt").classed("belt-count", true)
    row.append("td").classed("pad building building-icon leftmost right-align", true)
    row.append("td").classed("right-align building", true).append("tt").classed("building-count", true)
    row.append("td").classed("pad building module module-cell", true)

    const beaconCell = row.append("td").classed("pad building module beacon", true)
    beaconCell.append("span").classed("beacon-container", true)
    const beaconCountSpan = beaconCell.append("span").classed("beacon-count", true)
    beaconCountSpan.append("span").text(" \u00d7 ")
    beaconCountSpan.append("input").attr("type", "text").attr("size", 3).on("change", (event: Event, d: DisplayRow) => {
        if (d.moduleSpec === null || d.recipe === null) {
            return
        }
        d.moduleSpec.setBeaconCount(Rational.from_string((event.target as HTMLInputElement).value))
        moduleChanged(d.recipe, false)
    })

    row.append("td").classed("pad building fuel-icon", true)
    row.append("td").classed("right-align building", true).append("tt").classed("power", true)
    const popout = row.append("td").classed("popout pad item", true).append("a")
    popout.attr("target", "_blank").attr("rel", "noopener").attr("title", "Open this item in separate window.")
    svgIcon(popout, "popout", [24, 24], "images/icons.svg#popout")
    return row
}

// Renders the breakdown rows that follow each item row.
function renderBreakdowns(itemRows: RowSelection, totalCols: number): void {
    const breakdown = itemRows.select<HTMLTableRowElement>(function () {
        const tr = document.createElement("tr")
        this.parentNode?.insertBefore(tr, this.nextSibling)
        return tr
    })
    breakdown.classed("breakdown", true)
    breakdown.classed("breakdown-open", function () {
        return this.previousElementSibling?.classList.contains("breakdown-open") ?? false
    })
    breakdown.append("td")

    const table = breakdown.append("td").attr("colspan", totalCols - 1).append("table")
    const row = table.selectAll<HTMLTableRowElement, BreakdownRow>("tr").data(d => d.breakdown ?? []).join("tr")
    row.classed("breakdown-row", true).classed("breakdown-first-output", d => d.divider)

    const icons = row.append("td")
    icons.append(d => iconOf(d.recipe).make(32)).classed("item-icon", true)
    svgIcon(icons, "usage-arrow", [18, 16], "images/icons.svg#rightarrow")
    icons.append(d => iconOf(d.item).make(32)).classed("item-icon", true)
    row.append("td").classed("right-align", true).append("tt").classed("item-rate pad-right", true).text(d => alignItemRate(d.item, d.rate))

    const beltRow = row.filter(d => d.item.phase === "solid")
    const beltCell = beltRow.append("td")
    beltCell.append(() => iconOf(spec.belt).make(32))
    beltCell.append("span").text(" \u00d7")
    const beltCount = beltRow.append("td").classed("right-align", true).append("tt").classed("belt-count pad-right", true)
    beltCount.text(d => spec.format.alignCount(d.rate.div(spec.belt.rate)))

    const pipeRow = row.filter(d => d.item.phase === "fluid")
    pipeRow.append("td").append(() => pipeIcon())
    pipeRow.append("td")

    const buildingCell = row.append("td").filter(d => d.building !== null).classed("building", true)
    buildingCell.append(d => iconOf(buildingOf(d)).make(32))
    buildingCell.append("span").text(" \u00d7")
    const count = row.append("td").filter(d => d.count !== null).classed("building pad-right", true).append("tt")
    count.text(d => d.count === null ? "" : spec.format.alignCount(d.count))
    row.append("td").filter(d => d.percent !== null).classed("right-align", true).append("tt").text(d => d.percent ?? "")
}

/** Renders the solution into the factory table. */
export function displayItems(context: FactorySpecification, totals: Totals | null): void {
    if (totals === null) {
        return
    }
    const rateName = context.format.rateName
    const headers: Header[] = [
        { text: "", colspan: 1, surplus: false },
        { text: `items/${rateName}`, colspan: 2, surplus: false },
        { text: `surplus/${rateName}`, colspan: 1, surplus: true },
        { text: "belts", colspan: 2, surplus: false },
        { text: "buildings", colspan: 2, surplus: false },
        { text: "modules", colspan: 1, surplus: false },
        { text: "beacons", colspan: 1, surplus: false },
        { text: "power", colspan: 2, surplus: false },
        // Popout links.
        { text: "", colspan: 1, surplus: false },
    ]
    const totalCols = headers.reduce((sum, h) => sum + h.colspan, 0)

    const table = d3.select<HTMLTableElement, unknown>("table#totals")
    table.classed("nosurplus", totals.surplus.size === 0)
    const headerRow = table.selectAll("thead tr").classed("factory-header", true)
    const headerCells = headerRow.selectAll<HTMLTableCellElement, Header>("th").data(headers).join("th")
    headerCells.classed("surplus", d => d.surplus).text(d => d.text).attr("colspan", d => d.colspan)

    const rowGroup = table.selectAll<HTMLTableSectionElement, DisplayGroup>("tbody").data(getDisplayGroups(totals)).join("tbody")
    rowGroup.classed("display-group", true).classed("multi", d => d.rows.length > 1)
    rowGroup.selectAll("tr.breakdown").remove()
    const row: RowSelection = rowGroup.selectAll<HTMLTableRowElement, DisplayRow>("tr").data(d => d.rows).join(createRow)
    // Cells keep the data they were created with. A reused row passes its new data on.
    row.each(function (d) {
        d3.select(this).selectAll("*").datum(d)
    })
    row.classed("nobuilding", d => d.building === null).classed("nomodule", d => d.moduleSpec === null).classed("noitem", d => d.item === null)

    const itemRow = row.filter(d => d.item !== null)
    const itemIcon = itemRow.selectAll<HTMLTableCellElement, DisplayRow>(".item-icon")
    itemIcon.selectAll("img").remove()
    const itemImage = itemIcon.append(d => {
        const ignored = spec.ignore.has(itemOf(d))
        return itemRowIcon(itemOf(d), ignored ? "(Click to unignore.)" : "(Click to ignore.)")
    })
    itemImage.classed("ignore", d => spec.ignore.has(itemOf(d))).on("click", (event: Event, d: DisplayRow) => toggleIgnoreHandler(event, { item: itemOf(d) }))

    const surplusOf = (d: DisplayRow): Rational => rateOf(totals.surplus, itemOf(d))
    itemRow.selectAll<HTMLElement, DisplayRow>("tt.item-rate").text(d => alignItemRate(itemOf(d), rateOf(totals.items, itemOf(d)).sub(surplusOf(d))))
    itemRow.selectAll<HTMLElement, DisplayRow>("tt.surplus-rate").text(d => alignItemRate(itemOf(d), surplusOf(d)))

    const beltRow = itemRow.filter(d => itemOf(d).phase === "solid")
    const beltIcon = beltRow.selectAll<HTMLTableCellElement, DisplayRow>("td.belt-icon").classed("pad-right", false).attr("colspan", 1)
    beltIcon.selectAll("*").remove()
    beltIcon.append(() => iconOf(spec.belt).make(32))
    beltIcon.append("span").text(" \u00d7")
    const beltCount = beltRow.selectAll("td.belt-count-cell").classed("hide", false).selectAll<HTMLElement, DisplayRow>("tt.belt-count")
    beltCount.text(d => spec.format.alignCount(spec.getBeltCount(rateOf(totals.items, itemOf(d)))))

    const pipeRow = itemRow.filter(d => itemOf(d).phase === "fluid")
    const pipeCell = pipeRow.selectAll("td.belt-icon").classed("pad-right", true).attr("colspan", 2)
    pipeCell.selectAll("*").remove()
    pipeCell.append(() => pipeIcon())
    pipeRow.selectAll("td.belt-count-cell").classed("hide", true).selectAll("tt.belt-count").text("")

    const buildingRow = row.filter(d => d.building !== null && d.recipe !== null)
    const buildingCell = buildingRow.selectAll<HTMLTableCellElement, DisplayRow>("td.building-icon")
    buildingCell.selectAll("*").remove()
    const buildingExtra = buildingCell.filter(d => !d.single)
    buildingExtra.append(d => iconOf(recipeOf(d)).make(32))
    buildingExtra.append("span").text(":")
    buildingCell.append(d => iconOf(buildingOf(d)).make(32))
    buildingCell.append("span").text(" \u00d7")
    const buildingCount = buildingRow.selectAll<HTMLElement, DisplayRow>("tt.building-count")
    buildingCount.text(d => spec.format.alignCount(spec.getCount(recipeOf(d), rateOf(totals.rates, recipeOf(d)))))

    // The dropdowns are rebuilt on every update, because their contents depend on the row.
    const moduleRow = row.filter(d => d.moduleSpec !== null)
    const moduleCell = moduleRow.selectAll<HTMLTableCellElement, DisplayRow>("td.module-cell")
    moduleCell.selectAll("*").remove()
    const beaconContainer = moduleRow.selectAll<HTMLSpanElement, DisplayRow>("span.beacon-container")
    beaconContainer.selectAll("*").remove()
    moduleDropdown(moduleCell, d => d.slots)
    moduleDropdown(beaconContainer, d => d.beaconModules)
    const beaconCountInput = moduleRow.selectAll<HTMLInputElement, DisplayRow>("span.beacon-count input")
    beaconCountInput.attr("value", d => d.moduleSpec === null ? "" : spec.format.count(d.moduleSpec.beaconCount))

    const powerOf = (d: DisplayRow): Rational => spec.getPowerUsage(recipeOf(d), rateOf(totals.rates, recipeOf(d))).power
    const fuelRow = buildingRow.filter(d => buildingOf(d).fuel !== null)
    const fuelIcon = fuelRow.selectAll<HTMLTableCellElement, DisplayRow>(".fuel-icon")
    fuelIcon.selectAll("*").remove()
    fuelIcon.append(d => iconOf(fuelOf(d)).make(32))
    fuelIcon.append("span").text(" \u00d7 ")
    fuelRow.selectAll<HTMLElement, DisplayRow>("tt.power").text(d => `${spec.format.alignRate(powerOf(d).div(fuelOf(d).value))}/${spec.format.rateName}`)

    const electricRow = buildingRow.filter(d => buildingOf(d).fuel === null)
    let totalPower = zero
    electricRow.selectAll(".fuel-icon").selectAll("*").remove()
    electricRow.selectAll<HTMLElement, DisplayRow>("tt.power").text(d => {
        const power = powerOf(d)
        totalPower = totalPower.add(power)
        return alignPower(power)
    })

    const popoutLink = itemRow.selectAll<HTMLAnchorElement, DisplayRow>("td.popout a")
    popoutLink.attr("href", d => "#" + formatSettings(true, "totals", [[itemOf(d), rateOf(totals.items, itemOf(d))]]))

    renderBreakdowns(row.filter(d => d.breakdown !== null), totalCols)

    const footerRow = table.select("tfoot tr")
    footerRow.select("td.power-label").attr("colspan", totalCols - 3)
    footerRow.select("tt").text(alignPower(totalPower))
    table.select("tfoot").raise()
}

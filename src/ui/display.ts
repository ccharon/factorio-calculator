// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// The factory table: one row per recipe of the solution, grouped by shared products, with
// rates, belts, buildings, modules, beacons, power and a usage breakdown per item.

import * as d3 from "d3"
import { type Rational, zero, one, hundred } from "../core/rational.ts"
import type { Totals } from "../core/totals.ts"
import type { Building } from "../data/building.ts"
import type { Fuel } from "../data/fuel.ts"
import { getRecipeGroups, topoSort } from "../data/groups.ts"
import type { Item } from "../data/item.ts"
import { type Module, type ModuleSpec, moduleRows } from "../data/module.ts"
import type { QualityKind } from "../data/quality.ts"
import { PIPE } from "../data/game.ts"
import { ELECTRICITY_UNIT, Recipe, type RecipeLike, type RecipeNode, isEnergyKey, isRecipeLike } from "../data/recipe.ts"
import type { FactorySpecification } from "../state/factory.ts"
import { spec } from "../state/factory.ts"
import { formatSettings } from "../state/fragment.ts"
import { powerRepr } from "./energy.ts"
import { toggleIgnoreHandler } from "./events.ts"
import type { IconSource } from "../data/icon-source.ts"
import { ICON_SIZE, Icon } from "./icon.ts"
import { type ModuleCell, type ModuleInput as DropdownInput, moduleDropdown } from "./module-dropdown.ts"
import { iconOf, renderItemTooltip } from "./icons.ts"
import { readRational } from "./number-input.ts"
import { qualityDropdown } from "./quality-dropdown.ts"

function alignPower(x: Rational): string {
    const { power, suffix } = powerRepr(x)
    return `${spec.format.alignCount(power)} ${suffix}`
}

// Returns the rate of item for the table. Electricity and heat show as power.
function alignItemRate(item: Item, rate: Rational): string {
    return isEnergyKey(item.key) ? alignPower(rate.mul(ELECTRICITY_UNIT)) : spec.format.alignRate(rate)
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
    readonly kind: "row"
    /** Identifies the row across updates: the keys of its item and recipe. */
    readonly key: string
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

/** The row below an item row that holds the breakdown of the item. */
interface BreakdownLine {
    readonly kind: "breakdown"
    readonly key: string
    readonly row: DisplayRow
}

/** A row of a table section. */
type BodyRow = DisplayRow | BreakdownLine

/** Rows for one group of recipes that share products. */
interface DisplayGroup {
    /** Identifies the group across updates: the keys of its rows. */
    readonly key: string
    readonly rows: DisplayRow[]
}

function makeRow(totals: Totals, item: Item | null, recipe: RecipeLike | null): DisplayRow {
    const building = recipe === null ? null : spec.getBuilding(recipe)
    const moduleSpec = recipe !== null && building?.canBeacon() ? spec.getModuleSpec(recipe) ?? null : null
    return {
        kind: "row",
        key: `${item?.key ?? ""}|${recipe?.key ?? ""}`,
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
// Groups whose products the solution does not use get no rows.
function getDisplayGroups(totals: Totals): DisplayGroup[] {
    const recipes = Array.from(totals.rates.keys()).filter(isRecipeLike).reverse()
    return topoSort(getRecipeGroups(new Set(recipes)), spec).flatMap(group => {
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
            return []
        }
        const len = Math.max(itemList.length, recipeList.length)
        const rows = Array.from({ length: len }, (_, i) => makeRow(totals, itemList[i] ?? null, recipeList[i] ?? null))
        return [{ key: rows.map(row => row.key).join(","), rows }]
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
function itemRowIcon(item: Item, hint: string): HTMLElement {
    return new Icon(item, () => renderItemTooltip(item, d3.create("span").text(hint).node() ?? undefined), item.quality).make(ICON_SIZE)
}

function pipeIcon(): HTMLElement {
    const pipe = spec.items.get(PIPE)
    if (pipe === undefined) {
        throw new Error("dataset lacks the pipe")
    }
    return new Icon({ name: pipe.name, icon_col: pipe.icon_col, icon_row: pipe.icon_row }).make(ICON_SIZE)
}

// Returns the SVG icon with the given id from images/icons.svg. size is width and height of the viewBox.
function svgIcon(className: string, size: [number, number], id: string): SVGSVGElement {
    const [width, height] = size
    const svg = d3.create("svg").classed(className, true).attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height)
    svg.append("use").attr("href", `images/icons.svg#${id}`)
    return nodeOf(svg)
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
    return spec.fuel.get(category)
}

// The quality kinds that change the results of a building: machine quality only where it changes the speed.
function qualityKinds(building: Building): QualityKind[] {
    const kinds: QualityKind[] = building.hasQualitySpeed() ? ["machine"] : []
    return building.canBeacon() ? [...kinds, "module", "beacon"] : kinds
}

function craftRecipeOf(d: DisplayRow): Recipe {
    const recipe = recipeOf(d)
    if (!(recipe instanceof Recipe)) {
        throw new Error("row without crafting recipe")
    }
    return recipe
}

function buildingOf(d: { readonly building: Building | null }): Building {
    if (d.building === null) {
        throw new Error("row without building")
    }
    return d.building
}

// Creates a table row with empty cells. Updates fill them in.
function createRow(): HTMLTableRowElement {
    const row = d3.create("tr").classed("display-row", true)
    row.append("td").classed("item", true).on("click", toggleBreakdownHandler).append(() => svgIcon("breakdown-arrow", [16, 16], "right"))
    row.append("td").classed("item item-icon", true)
    row.append("td").classed("item right-align", true).append("tt").classed("item-rate", true)
    row.append("td").classed("item surplus right-align", true).append("tt").classed("surplus-rate", true)
    row.append("td").classed("item pad belt-icon", true)
    row.append("td").classed("item right-align belt-count-cell pad-right", true).append("tt").classed("belt-count", true)
    row.append("td").classed("pad building building-icon leftmost right-align", true)
    row.append("td").classed("right-align building", true).append("tt").classed("building-count", true)
    row.append("td").classed("pad building quality-cell", true)
    row.append("td").classed("pad building module module-cell", true)

    const beaconCell = row.append("td").classed("pad building module beacon", true)
    beaconCell.append("span").classed("beacon-container", true)
    const beaconCountSpan = beaconCell.append("span").classed("beacon-count", true)
    beaconCountSpan.append("span").text(" × ")
    beaconCountSpan.append("input").attr("type", "text").attr("size", 3)

    row.append("td").classed("pad building fuel-icon", true)
    row.append("td").classed("right-align building", true).append("tt").classed("power", true)
    const popout = row.append("td").classed("popout pad item", true).append("a")
    popout.attr("target", "_blank").attr("rel", "noopener").attr("title", "Open this item in separate window.")
    popout.append(() => svgIcon("popout", [24, 24], "popout"))
    return nodeOf(row)
}

// Creates the row below an item row that holds its breakdown table.
function createBreakdownRow(): HTMLTableRowElement {
    const row = d3.create("tr").classed("breakdown", true)
    row.append("td")
    row.append("td").classed("breakdown-cell", true).append("table")
    return nodeOf(row)
}

function nodeOf<E extends Element>(selection: d3.Selection<E, undefined, null, undefined>): E {
    const node = selection.node()
    if (node === null) {
        throw new Error("empty selection")
    }
    return node
}

// Returns a table cell with the given classes and content.
function cell(className: string, ...content: Node[]): HTMLTableCellElement {
    const td = document.createElement("td")
    if (className !== "") {
        td.className = className
    }
    td.append(...content)
    return td
}

// Returns a span with text, such as the separators between icons.
function span(text: string): HTMLSpanElement {
    const element = document.createElement("span")
    element.textContent = text
    return element
}

// Returns a <tt> element with the given classes and text, for numbers.
function tt(className: string, text: string): HTMLElement {
    const element = document.createElement("tt")
    if (className !== "") {
        element.className = className
    }
    element.textContent = text
    return element
}

// Replaces the content of each element of selection with the nodes that content returns for its datum.
function fill<E extends Element, D, P extends d3.BaseType, PD>(selection: d3.Selection<E, D, P, PD>, content: (d: D) => Node[]): void {
    selection.each(function (d) {
        this.replaceChildren(...content(d))
    })
}

// Returns the cells of one line of a breakdown table.
function breakdownCells(line: BreakdownRow): HTMLTableCellElement[] {
    const recipeIcon = iconOf(line.recipe).make(ICON_SIZE)
    const itemIcon = iconOf(line.item).make(ICON_SIZE)
    recipeIcon.classList.add("item-icon")
    itemIcon.classList.add("item-icon")

    // Solid items move on belts and fluids in pipes. Electricity and heat get neither.
    let transport: HTMLTableCellElement[] = []
    if (line.item.phase === "solid") {
        const belts = spec.format.alignCount(line.rate.div(spec.belt.rate))
        transport = [cell("", iconOf(spec.belt).make(ICON_SIZE), span(" ×")), cell("right-align", tt("belt-count pad-right", belts))]
    } else if (line.item.phase === "fluid") {
        transport = [cell("", pipeIcon()), cell("")]
    }

    return [
        cell("", recipeIcon, svgIcon("usage-arrow", [18, 16], "rightarrow"), itemIcon),
        cell("right-align", tt("item-rate pad-right", alignItemRate(line.item, line.rate))),
        ...transport,
        line.building === null ? cell("") : cell("building", iconOf(line.building).make(ICON_SIZE), span(" ×")),
        line.count === null ? cell("") : cell("building pad-right", tt("", spec.format.alignCount(line.count))),
        line.percent === null ? cell("") : cell("right-align", tt("", line.percent)),
    ]
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
        { text: "buildings", colspan: 3, surplus: false },
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

    // Rows and their breakdowns are keyed, so that they keep their elements and an open breakdown stays open.
    const rowGroup = table.selectAll<HTMLTableSectionElement, DisplayGroup>("tbody").data(getDisplayGroups(totals), d => d.key).join("tbody")
    rowGroup.classed("display-group", true).classed("multi", d => d.rows.length > 1)
    rowGroup.selectAll<HTMLTableRowElement, BodyRow>(":scope > tr")
        .data(d => d.rows.flatMap((row): BodyRow[] => row.breakdown === null ? [row] : [row, { kind: "breakdown", key: `breakdown:${row.key}`, row }]), d => d.key)
        .join(enter => enter.append(d => d.kind === "row" ? createRow() : createBreakdownRow()))

    // select() passes the data of each row on to its cells, so that reused cells show the new data.
    const row = rowGroup.selectAll<HTMLTableRowElement, DisplayRow>(":scope > tr.display-row")
    row.classed("nobuilding", d => d.building === null).classed("nomodule", d => d.moduleSpec === null).classed("noitem", d => d.item === null)

    const itemRow = row.filter(d => d.item !== null)
    fill(itemRow.select<HTMLTableCellElement>("td.item-icon"), d => {
        const item = itemOf(d)
        const ignored = spec.ignore.has(item)
        const icon = itemRowIcon(item, ignored ? "(Click to unignore.)" : "(Click to ignore.)")
        icon.classList.toggle("ignore", ignored)
        icon.addEventListener("click", event => toggleIgnoreHandler(event, { item }))
        return [icon]
    })

    const surplusOf = (d: DisplayRow): Rational => rateOf(totals.surplus, itemOf(d))
    itemRow.select("tt.item-rate").text(d => alignItemRate(itemOf(d), rateOf(totals.items, itemOf(d)).sub(surplusOf(d))))
    itemRow.select("tt.surplus-rate").text(d => alignItemRate(itemOf(d), surplusOf(d)))

    const beltRow = itemRow.filter(d => itemOf(d).phase === "solid")
    fill(beltRow.select<HTMLTableCellElement>("td.belt-icon").classed("pad-right", false).attr("colspan", 1), () => [iconOf(spec.belt).make(ICON_SIZE), span(" ×")])
    beltRow.select("td.belt-count-cell").classed("hide", false).select("tt.belt-count").text(d => spec.format.alignCount(spec.getBeltCount(rateOf(totals.items, itemOf(d)))))

    const pipeRow = itemRow.filter(d => itemOf(d).phase === "fluid")
    fill(pipeRow.select<HTMLTableCellElement>("td.belt-icon").classed("pad-right", true).attr("colspan", 2), () => [pipeIcon()])
    pipeRow.select("td.belt-count-cell").classed("hide", true).select("tt.belt-count").text("")

    const buildingRow = row.filter(d => d.building !== null && d.recipe !== null)
    fill(buildingRow.select<HTMLTableCellElement>("td.building-icon"), d => {
        const recipe = d.single ? [] : [iconOf(recipeOf(d)).make(ICON_SIZE), span(":")]
        return [...recipe, iconOf(buildingOf(d)).make(ICON_SIZE), span(" ×")]
    })
    buildingRow.select("tt.building-count").text(d => spec.format.alignCount(spec.getCount(recipeOf(d), rateOf(totals.rates, recipeOf(d)))))

    // The quality dropdown is rebuilt, because the quality kinds depend on the building.
    const qualityCell = buildingRow.select<HTMLTableCellElement>("td.quality-cell")
    fill(qualityCell, () => [])
    qualityDropdown(qualityCell.filter(d => recipeOf(d) instanceof Recipe && qualityKinds(buildingOf(d)).length > 0), craftRecipeOf, d => qualityKinds(buildingOf(d)), () => spec.updateSolution())

    const moduleRow = row.filter(d => d.moduleSpec !== null)
    moduleDropdown(moduleRow.select<HTMLTableCellElement>("td.module-cell"), d => d.slots)
    moduleDropdown(moduleRow.select<HTMLSpanElement>("span.beacon-container"), d => d.beaconModules)
    moduleRow.select<HTMLInputElement>("span.beacon-count input")
        .property("value", d => d.moduleSpec === null ? "" : spec.format.count(d.moduleSpec.beaconCount))
        .on("change", (event: Event, d: DisplayRow) => {
            const count = readRational(event.target as HTMLInputElement)
            if (count !== null && d.moduleSpec !== null) {
                d.moduleSpec.setBeaconCount(count)
                moduleChanged(d.moduleSpec.recipe, false)
            }
        })

    const powerOf = (d: DisplayRow): Rational => spec.getPowerUsage(recipeOf(d), rateOf(totals.rates, recipeOf(d))).power
    const fuelRow = buildingRow.filter(d => buildingOf(d).fuel !== null)
    fill(fuelRow.select<HTMLTableCellElement>("td.fuel-icon"), d => [iconOf(fuelOf(d)).make(ICON_SIZE), span(" × ")])
    fuelRow.select("tt.power").text(d => `${spec.format.alignRate(powerOf(d).div(fuelOf(d).value))}/${spec.format.rateName}`)

    const electricRow = buildingRow.filter(d => buildingOf(d).fuel === null)
    let totalPower = zero
    fill(electricRow.select<HTMLTableCellElement>("td.fuel-icon"), () => [])
    electricRow.select("tt.power").text(d => {
        const power = powerOf(d)
        totalPower = totalPower.add(power)
        return alignPower(power)
    })

    itemRow.select("td.popout a").attr("href", d => "#" + formatSettings(true, "totals", [[itemOf(d), rateOf(totals.items, itemOf(d))]]))

    // The breakdown tables are rebuilt, because their lines differ in their cells.
    const breakdown = rowGroup.selectAll<HTMLTableRowElement, BreakdownLine>(":scope > tr.breakdown")
    breakdown.select("td.breakdown-cell").attr("colspan", totalCols - 1)
    const lines = breakdown.select("table").selectAll<HTMLTableRowElement, BreakdownRow>("tr").data(d => d.row.breakdown ?? []).join("tr")
    lines.classed("breakdown-row", true).classed("breakdown-first-output", d => d.divider)
    fill(lines, breakdownCells)

    const footerRow = table.select("tfoot tr")
    // Besides the label, the footer has a cell under the surplus column, the total and a cell under the popout links.
    footerRow.select("td.power-label").attr("colspan", totalCols - 3)
    footerRow.select("tt").text(alignPower(totalPower))
    table.select("tfoot").raise()
}

/** Dims the factory table while a solution is computed. The style sheet delays the dimming, so quick solves do not flicker. */
export function setSolving(solving: boolean): void {
    d3.select("table#totals").classed("solving", solving)
}

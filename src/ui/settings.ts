// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Applies URL settings to the calculator state and renders the Settings tab.
//
// Each setting has a render function that reads its value from the settings map, falls back to
// the default if the value is missing or invalid, applies it, and renders its controls.
// Every setting must also be written in state/fragment.ts.

import * as d3 from "d3"
import { type Rational, zero, hundred } from "../core/rational.ts"
import { sorted } from "../core/sort.ts"
import type { Building } from "../data/building.ts"
import type { IconSource } from "../data/icon-source.ts"
import type { Fuel } from "../data/fuel.ts"
import { NUCLEAR_REACTOR_CYCLE } from "../data/game.ts"
import { getRecipeGroups } from "../data/groups.ts"
import { type Module, moduleRows, shortModules } from "../data/module.ts"
import type { Planet } from "../data/planet.ts"
import { QUALITY_KINDS, type Quality, type QualityKind } from "../data/quality.ts"
import type { ProductivityResearch } from "../data/research.ts"
import { ReactorRecipe, type Recipe, type RecipeLike } from "../data/recipe.ts"
import {
    DEFAULT_RATE, DEFAULT_RATE_PRECISION, DEFAULT_COUNT_PRECISION, DEFAULT_FORMAT, type DisplayFormat, isRateName, longRateNames, MAX_PRECISION, type RateName,
} from "../state/align.ts"
import type { BuildingGroup } from "../state/building-groups.ts"
import { reactorNeighbours } from "../state/energy.ts"
import { DEFAULT_PLANET, DEFAULT_BELT, DEFAULT_REACTOR_BLOCK, spec } from "../state/factory.ts"
import { BUILDING_TARGET, NO_MODULE, RATE_TARGET, type Settings } from "../state/url-codec.ts"
import { type ColorScheme, colorSchemes } from "./color.ts"
import {
    DEFAULT_TAB, clickTab, DEFAULT_VISUALIZER, visualizerType, setVisualizerType, DEFAULT_RENDER, visualizerRender, setVisualizerRender,
    visualizerDirection, getDefaultVisDirection, setVisualizerDirection, visualizerElectricity, setVisualizerElectricity,
} from "./events.ts"
import { type ModuleCell, type ModuleInput, moduleDropdown } from "./module-dropdown.ts"
import { QUALITY_KIND_LABELS } from "./quality-dropdown.ts"
import { ICON_SIZE } from "./icon.ts"
import { iconOf } from "./icons.ts"
import { readCount, readRational, toCount, toRational } from "./number-input.ts"
import { addTarget } from "./target.ts"
import { warnUrl } from "./warnings.ts"

const MAX_REACTOR_BLOCK = 100

// Parses a non-negative rational from the URL. Invalid or negative values log a warning and return null.
function parseRational(value: string, name: string): Rational | null {
    const r = toRational(value)
    if (r === null) {
        warnUrl(`invalid ${name}`, value)
        return null
    }
    // Rates, counts, bonuses and weights are never negative.
    if (r.less(zero)) {
        warnUrl(`negative ${name}`, value)
        return null
    }
    return r
}

// Parses a whole number from 0 to max from the URL, or returns fallback.
function parseCount(value: string | undefined, fallback: number, name: string, max: number): number {
    if (value === undefined) {
        return fallback
    }
    const n = toCount(value, max)
    if (n === null) {
        warnUrl(`invalid ${name}`, value)
        return fallback
    }
    return n
}

function splitList(value: string | undefined): string[] {
    return value === undefined || value === "" ? [] : value.split(",")
}

// tab

function renderTab(settings: Settings): void {
    clickTab(settings.get("tab") ?? DEFAULT_TAB)
}

// build targets

function renderTargets(settings: Settings): void {
    spec.buildTargets = []
    d3.selectAll("#targets li.target").remove()

    const targets = splitList(settings.get("items"))
    if (targets.length === 0) {
        addTarget()
        return
    }

    for (const targetString of targets) {
        const [itemKey = "", type, value = "", recipeKey] = targetString.split(":")
        if (spec.findItem(itemKey) === undefined) {
            warnUrl("unknown item", itemKey)
            continue
        }

        if (type === BUILDING_TARGET) {
            let recipe: Recipe | null = null
            if (recipeKey !== undefined) {
                recipe = spec.findRecipe(recipeKey) ?? null
                if (recipe === null) {
                    warnUrl("unknown recipe", recipeKey)
                    continue
                }
            }
            if (parseRational(value, "building count") === null) {
                continue
            }
            const target = addTarget(itemKey)
            target.setBuildings(value, recipe)
            target.displayRecipes()
        } else if (type === RATE_TARGET) {
            if (parseRational(value, "rate") === null) {
                continue
            }
            addTarget(itemKey).setRate(value)
        } else {
            warnUrl("unknown target type", targetString)
        }
    }

    if (spec.buildTargets.length === 0) {
        addTarget()
    }
}

// modules

// Returns the module for a full or short module key, null for NO_MODULE, or undefined if unknown.
function getModule(moduleKey: string): Module | null | undefined {
    if (moduleKey === NO_MODULE) {
        return null
    }
    const module = spec.modules.get(moduleKey) ?? shortModules.get(moduleKey)
    if (module === undefined) {
        warnUrl("unknown module", moduleKey)
    }
    return module
}

// Applies per-recipe module and beacon settings. Buildings must be configured first.
function renderModules(settings: Settings): void {
    for (const recipeSetting of splitList(settings.get("modules"))) {
        const [buildingModuleSettings = "", beaconSettings] = recipeSetting.split(";")
        const [recipeKey = "", ...moduleKeyList] = buildingModuleSettings.split(":")
        const recipe = spec.findRecipe(recipeKey)
        if (recipe === undefined) {
            warnUrl("unknown recipe", recipeKey)
            continue
        }

        const moduleSpec = spec.getModuleSpec(recipe)
        if (moduleSpec === undefined) {
            warnUrl("modules for recipe without module slots", recipeKey)
            continue
        }

        moduleKeyList.forEach((moduleKey, i) => {
            const module = moduleKey === "" ? undefined : getModule(moduleKey)
            if (module !== undefined) {
                moduleSpec.setModule(i, module)
            }
        })

        if (beaconSettings !== undefined) {
            const [key1 = NO_MODULE, key2 = NO_MODULE, countStr = "0"] = beaconSettings.split(":")
            const count = parseRational(countStr, "beacon count")
            moduleSpec.setBeaconModule(getModule(key1) ?? null, 0)
            moduleSpec.setBeaconModule(getModule(key2) ?? null, 1)
            if (count !== null) {
                moduleSpec.setBeaconCount(count)
            }
        }
    }
}

// ignore

function renderIgnore(settings: Settings): void {
    spec.ignore.clear()
    // The table shows the ignore state when the solution renders.
    for (const itemKey of splitList(settings.get("ignore"))) {
        const item = spec.items.get(itemKey)
        if (item === undefined) {
            warnUrl("unknown item", itemKey)
            continue
        }
        spec.ignore.add(item)
    }
}

// title

export const DEFAULT_TITLE = "Factorio Calculator"

/** Sets the page title. An empty string restores the default. */
export function setTitle(s: string): void {
    document.title = s === "" ? DEFAULT_TITLE : s
}

function renderTitle(settings: Settings): void {
    let title = ""
    const encoded = settings.get("title")
    if (encoded !== undefined) {
        try {
            title = decodeURIComponent(encoded)
        } catch {
            warnUrl("invalid title", encoded)
        }
    }
    const input = document.getElementById("title_setting")
    if (input instanceof HTMLInputElement) {
        input.value = title
    }
    setTitle(title)
}

// display rate

function renderRateOptions(settings: Settings): void {
    const requested = settings.get("rate")
    let rateName: RateName = DEFAULT_RATE
    if (requested !== undefined) {
        if (isRateName(requested)) {
            rateName = requested
        } else {
            warnUrl("unknown rate", requested)
        }
    }

    spec.format.setDisplayRate(rateName)
    const rates = Array.from(longRateNames, ([name, longName]) => ({ name, longName }))
    const form = d3.select("#display_rate")
    form.selectAll("*").remove()
    const option = form.selectAll<HTMLSpanElement, typeof rates[number]>("span").data(rates).join("span")
    const input = option.append("input").attr("id", d => `${d.name}_rate`).attr("type", "radio").attr("name", "rate").attr("value", d => d.name)
    input.property("checked", d => d.name === rateName).on("change", (_event: Event, d) => {
        spec.format.setDisplayRate(d.name)
        spec.display()
    })

    option.append("label").attr("for", d => `${d.name}_rate`).text(d => `items/${d.longName}`)
    option.append("br")
}

// precisions

function renderPrecisions(settings: Settings): void {
    spec.format.ratePrecision = parseCount(settings.get("rp"), DEFAULT_RATE_PRECISION, "precision", MAX_PRECISION)
    d3.select("#rprec").attr("value", spec.format.ratePrecision)
    spec.format.countPrecision = parseCount(settings.get("cp"), DEFAULT_COUNT_PRECISION, "precision", MAX_PRECISION)
    d3.select("#cprec").attr("value", spec.format.countPrecision)
}

// value format

const displayFormats: ReadonlyMap<string, DisplayFormat> = new Map([
    ["d", "decimal"],
    ["r", "rational"],
])

function renderValueFormat(settings: Settings): void {
    const vf = settings.get("vf")
    spec.format.displayFormat = (vf === undefined ? undefined : displayFormats.get(vf)) ?? DEFAULT_FORMAT
    const input = document.getElementById(`${spec.format.displayFormat}_format`)
    if (input instanceof HTMLInputElement) {
        input.checked = true
    }
}

// nuclear reactor block

// Shows the heat bonus of each reactor for the block length.
function showReactorBonus(): void {
    const bonus = spec.recipes.get(NUCLEAR_REACTOR_CYCLE)
    const neighbours = reactorNeighbours(spec.reactorBlock)
    const percent = bonus instanceof ReactorRecipe ? bonus.neighbourBonus.mul(neighbours).mul(hundred) : zero
    d3.select("#reactor_bonus").text(`(+${percent.toDecimal(1)}% heat)`)
}

function renderReactorBlock(settings: Settings): void {
    spec.reactorBlock = parseCount(settings.get("reactors"), DEFAULT_REACTOR_BLOCK, "reactor block", MAX_REACTOR_BLOCK)
    d3.select<HTMLInputElement, unknown>("#reactor_block").property("value", spec.reactorBlock).on("change", function () {
        const count = readCount(this, MAX_REACTOR_BLOCK)
        if (count !== null) {
            spec.reactorBlock = count
            showReactorBonus()
            spec.updateSolution()
        }
    })
    showReactorBonus()
}

function renderMiningProd(settings: Settings): void {
    const mprod = settings.get("mprod") ?? "0"
    const value = parseRational(mprod, "mining productivity")
    const input = document.getElementById("mprod")
    if (input instanceof HTMLInputElement) {
        input.value = value === null ? "0" : mprod
    }
    spec.miningProd = (value ?? zero).div(hundred)
}

// recipe productivity research

// Returns the level for research from the URL value, or null if it is not a valid level.
function parseLevel(research: ProductivityResearch, value: string): number | null {
    return toCount(value, research.maxLevel ?? Number.POSITIVE_INFINITY)
}

function renderResearch(settings: Settings): void {
    spec.researchLevels.clear()
    // Each entry is a technology key and its level, separated by a colon.
    for (const entry of splitList(settings.get("rprod"))) {
        const [key = "", value = ""] = entry.split(":")
        const research = spec.research.find(r => r.key === key)
        const level = research === undefined ? null : parseLevel(research, value)
        if (research === undefined || level === null) {
            warnUrl("invalid productivity research", entry)
            continue
        }
        spec.researchLevels.set(research, level)
    }

    const div = d3.select("#research_selector")
    div.selectAll("*").remove()
    const entries = div.selectAll<HTMLSpanElement, ProductivityResearch>("span").data(sorted(spec.research, r => r.order)).join("span").classed("research", true)
    entries.append(d => iconOf(d).make(ICON_SIZE))
    const input = entries.append("input").attr("type", "number").attr("min", 0).attr("step", 1).attr("max", d => d.maxLevel)
    input.property("value", d => spec.researchLevels.get(d) ?? 0).on("change", function (_event: Event, d: ProductivityResearch) {
        const level = parseLevel(d, this.value)
        if (level === null) {
            this.value = String(spec.researchLevels.get(d) ?? 0)
            return
        }
        spec.researchLevels.set(d, level)
        spec.updateSolution()
    })
}

// color scheme

export const DEFAULT_COLOR_SCHEME = "default"

function findColorScheme(key: string): ColorScheme | undefined {
    return colorSchemes.find(scheme => scheme.key === key)
}

function defaultColorScheme(): ColorScheme {
    const scheme = findColorScheme(DEFAULT_COLOR_SCHEME)
    if (scheme === undefined) {
        throw new Error("the default color scheme is missing")
    }
    return scheme
}

/** The active color scheme. */
export let colorScheme: ColorScheme = defaultColorScheme()

function setColorScheme(schemeKey: string): void {
    const scheme = findColorScheme(schemeKey)
    if (scheme === undefined) {
        warnUrl("unknown color scheme", schemeKey)
        return
    }
    colorScheme = scheme
    colorScheme.apply()
}

function renderColorScheme(settings: Settings): void {
    const color = settings.get("c") ?? DEFAULT_COLOR_SCHEME
    setColorScheme(color)
    const select = d3.select("#color_scheme").on("change", (event: Event) => {
        setColorScheme((event.target as HTMLSelectElement).value)
        spec.display()
    })
    const options = select.selectAll<HTMLOptionElement, ColorScheme>("option").data(colorSchemes).join("option")
    options.attr("value", d => d.key).property("selected", d => d === colorScheme).text(d => d.name)
}

// radio buttons with icons

interface RadioChoice extends IconSource {
    readonly key: string
}

let radioInput = 0

// Renders one radio button with icon label per choice into each element of form.
function radioSetting<G extends HTMLElement, T extends RadioChoice, D>(
    form: d3.Selection<G, D, d3.BaseType, unknown>,
    name: string | ((d: D) => string),
    data: (d: D) => readonly T[],
    checked: (choice: T, d: D) => boolean,
    onchange: (choice: T, d: D) => void,
    disabled: (choice: T) => boolean = () => false,
): void {
    form.each(function (d) {
        const groupName = typeof name === "string" ? name : name(d)
        const option = d3.select(this).selectAll<HTMLSpanElement, T>("span").data(data(d)).join("span")
        option.each(function (choice) {
            const id = `radio-input-${radioInput++}`
            const span = d3.select(this)
            const input = span.append("input").attr("id", id).attr("type", "radio").attr("name", groupName).attr("value", choice.key)
            input.property("checked", checked(choice, d)).property("disabled", disabled(choice)).on("change", () => onchange(choice, d))
            span.append("label").attr("for", id).append(() => iconOf(choice).make(ICON_SIZE))
        })
    })
}

// buildings

function renderBuildings(settings: Settings): void {
    for (const group of spec.buildings.values()) {
        group.building = group.getDefault()
    }

    // Each entry is a group key and the selected building, separated by a colon.
    for (const entry of splitList(settings.get("buildings"))) {
        const [groupKey = "", buildingKey = ""] = entry.split(":")
        const group = spec.buildings.get(groupKey)
        const building = group?.buildings.find(b => b.key === buildingKey)
        if (group === undefined || building === undefined) {
            warnUrl("unknown building", entry)
            continue
        }
        group.building = building
    }
}

// Renders one row per building group with a choice. Call it after the planets are selected. Buildings that work on no selected planet are disabled.
function renderBuildingSelector(): void {
    const groups = sorted(Array.from(spec.buildings.values()).filter(g => g.buildings.length > 1), g => `${g.getDefault().name} ${g.key}`)
    const div = d3.select("#building_selector")
    div.selectAll("*").remove()
    const set = div.selectAll<HTMLDivElement, BuildingGroup>("div").data(groups).join("div").classed("radio-setting", true)
    radioSetting<HTMLDivElement, Building, BuildingGroup>(
        set,
        d => `building_selector_${groups.indexOf(d)}`,
        d => d.buildings,
        (building, group) => building === group.building,
        (building, group) => {
            spec.setGroupBuilding(group, building)
            spec.updateSolution()
        },
        building => !spec.buildingWorks(building),
    )
}

// quality

/** A global quality setting: its kind and URL key. */
export interface QualitySetting {
    readonly kind: QualityKind
    readonly key: string
}

/** The global quality settings in the order of QUALITY_KINDS. */
export const QUALITY_SETTINGS: readonly QualitySetting[] = [
    { kind: "machine", key: "qm" },
    { kind: "module", key: "qd" },
    { kind: "beacon", key: "qb" },
]

// Returns the quality with key, or undefined with a warning. An empty key is no quality and no warning.
function findQuality(key: string): Quality | undefined {
    const quality = spec.qualities.find(q => q.key === key)
    if (key !== "" && quality === undefined) {
        warnUrl("unknown quality", key)
    }
    return quality
}

function renderQuality(settings: Settings): void {
    for (const setting of QUALITY_SETTINGS) {
        const quality = findQuality(settings.get(setting.key) ?? "")
        if (quality !== undefined) {
            spec.globalQuality.set(setting.kind, quality)
        }
    }

    // Recipe qualities as recipe:machine:module:beacon, with empty fields for the global quality.
    for (const entry of splitList(settings.get("rq"))) {
        const [key = "", ...qualityKeys] = entry.split(":")
        const recipe = spec.findRecipe(key)
        if (recipe === undefined) {
            warnUrl("unknown recipe", key)
            continue
        }
        QUALITY_KINDS.forEach((kind, i) => {
            const quality = findQuality(qualityKeys[i] ?? "")
            if (quality !== undefined) {
                spec.setRecipeQuality(recipe, kind, quality)
            }
        })
    }

    const div = d3.select("#quality_selector")
    div.selectAll("*").remove()
    const rows = div.selectAll<HTMLDivElement, QualitySetting>("div").data(QUALITY_SETTINGS).join("div").classed("radio-setting", true)
    rows.append("b").classed("quality-label", true).text(d => QUALITY_KIND_LABELS.get(d.kind) ?? d.kind)
    radioSetting<HTMLDivElement, Quality, QualitySetting>(
        rows,
        d => `quality_${d.key}`,
        () => spec.qualities,
        (quality, d) => quality === spec.globalQuality.get(d.kind),
        (quality, d) => {
            spec.globalQuality.set(d.kind, quality)
            spec.updateSolution()
        },
    )
}

// belt

function renderBelts(settings: Settings): void {
    const requested = settings.get("belt")
    let belt = spec.belts.get(DEFAULT_BELT)
    if (requested !== undefined) {
        const b = spec.belts.get(requested)
        if (b === undefined) {
            warnUrl("unknown belt", requested)
        } else {
            belt = b
        }
    }

    if (belt !== undefined) {
        spec.belt = belt
    }

    const form = d3.select<HTMLElement, unknown>("#belt_selector")
    form.selectAll("*").remove()
    radioSetting(form, "belt", () => Array.from(spec.belts.values()), d => d === spec.belt, d => {
        spec.belt = d
        spec.display()
    })
}

// fuel

function renderFuel(settings: Settings): void {
    spec.fuel.selected.clear()
    // Each entry is a fuel key. It selects the fuel for each of its categories.
    for (const key of splitList(settings.get("fuel"))) {
        const fuel = spec.fuel.fuels.get(key)
        if (fuel === undefined) {
            warnUrl("unknown fuel", key)
            continue
        }
        for (const category of fuel.categories) {
            spec.fuel.selected.set(category, fuel)
        }
    }

    // One row per fuel category that a burner building uses and that offers a choice.
    const used = new Set(Array.from(spec.buildingKeys.values(), b => b.fuel).filter(c => c !== null))
    const categories = Array.from(used).filter(c => spec.fuel.fuelsOf(c).length > 1).sort()
    const div = d3.select("#fuel_selector")
    div.selectAll("*").remove()
    const rows = div.selectAll<HTMLDivElement, string>("div").data(categories).join("div").classed("radio-setting", true)
    radioSetting<HTMLDivElement, Fuel, string>(
        rows,
        category => `fuel_${category}`,
        category => spec.fuel.fuelsOf(category),
        (fuel, category) => fuel === spec.fuel.get(category),
        (fuel, category) => {
            spec.fuel.selected.set(category, fuel)
            spec.updateSolution()
        },
    )
}

// visualizer

function renderVisualizer(settings: Settings): void {
    setVisualizerType(settings.get("vt") ?? DEFAULT_VISUALIZER)
    d3.select(`#${visualizerType}_type`).property("checked", true)
    setVisualizerRender(settings.get("vr") ?? DEFAULT_RENDER)
    d3.select(`#${visualizerRender}_render`).property("checked", true)
    setVisualizerDirection(settings.get("vd") ?? getDefaultVisDirection())
    d3.select(`#${visualizerDirection}_direction`).property("checked", true)
    setVisualizerElectricity(settings.get("ve") === "1")
    d3.select("#graph_electricity").property("checked", visualizerElectricity)
}

// default modules

/** A module dropdown whose choices read and write one spec setting. */
class SettingCell implements ModuleCell {
    readonly name: string
    readonly inputRows: ModuleInput[][]

    /**
     * @param name - Radio group name, unique on the page.
     * @param filter - Which modules to offer.
     * @param get - Returns the current module of the setting.
     * @param set - Stores a chosen module.
     */
    constructor(name: string, filter: (module: Module) => boolean, get: () => Module | null, set: (module: Module | null) => void) {
        this.name = name
        this.inputRows = moduleRows.map(row => row.filter(module => module === null || filter(module)).map((module): ModuleInput => ({
            cell: this,
            module,
            checked: () => get() === module,
            choose: () => set(module),
        }))).filter(row => row.length > 0)
    }
}

function renderDefaultModule(settings: Settings): void {
    const dm = settings.get("dm")
    spec.setDefaultModule(dm === undefined ? null : getModule(dm) ?? null)
    const dm2 = settings.get("dm2")
    spec.setSecondaryDefaultModule(dm2 === undefined ? null : getModule(dm2) ?? null)

    const all = (): boolean => true
    const primary = d3.select<HTMLElement, unknown>("#default_module")
    primary.selectAll("*").remove()
    moduleDropdown(primary, [new SettingCell("default_module_dropdown", all, () => spec.defaultModule, module => {
        spec.setDefaultModule(module)
        spec.updateSolution()
    })])

    const secondary = d3.select<HTMLElement, unknown>("#secondary_module")
    secondary.selectAll("*").remove()
    moduleDropdown(secondary, [new SettingCell("secondary_module_dropdown", all, () => spec.secondaryDefaultModule, module => {
        spec.setSecondaryDefaultModule(module)
        spec.updateSolution()
    })])
}

// default beacon

function chooseDefaultBeacon(module: Module | null, index: 0 | 1): void {
    const oldModule = spec.defaultBeacon[index]
    spec.setDefaultBeacon(module, index)
    // Choosing the first slot also changes the second if both were equal.
    if (index === 0 && oldModule === spec.defaultBeacon[1]) {
        spec.setDefaultBeacon(module, 1)
        d3.selectAll<HTMLInputElement, ModuleInput>("#default_beacon span.module-wrapper:nth-child(2) input").property("checked", d => d.module === module)
    }
    spec.updateSolution()
}

function renderDefaultBeacon(settings: Settings): void {
    const keys = settings.get("db")?.split(":") ?? []
    const beaconModules: [Module | null, Module | null] = [getModule(keys[0] ?? NO_MODULE) ?? null, getModule(keys[1] ?? NO_MODULE) ?? null]
    const countStr = settings.get("dbc")
    const defaultCount = (countStr === undefined ? null : parseRational(countStr, "beacon count")) ?? zero

    spec.setDefaultBeacon(beaconModules[0], 0)
    spec.setDefaultBeacon(beaconModules[1], 1)
    spec.setDefaultBeaconCount(defaultCount)

    const beaconable = (module: Module): boolean => module.canBeacon()
    const cells = ([0, 1] as const).map(index => new SettingCell(
        `default_beacon_dropdown_${index}`,
        beaconable,
        () => spec.defaultBeacon[index],
        module => chooseDefaultBeacon(module, index),
    ))

    const select = d3.select<HTMLElement, unknown>("#default_beacon")
    select.selectAll("*").remove()
    moduleDropdown(select, cells)
    d3.select("#default_beacon_count").attr("value", defaultCount.toDecimal()).on("change", (event: Event) => {
        const count = readRational(event.target as HTMLInputElement)
        if (count !== null) {
            spec.setDefaultBeaconCount(count)
            spec.updateSolution()
        }
    })
}

// planets and recipe toggles

// Puts the factory on the clicked planet.
function clickPlanet(this: HTMLButtonElement, _event: MouseEvent, d: Planet): void {
    spec.selectPlanet(d)

    setPressed(d3.selectAll<HTMLButtonElement, Planet>("#planet_selector .toggle"), p => p === spec.planet)
    setPressed(d3.selectAll<HTMLButtonElement, Recipe>("#recipe_toggles .toggle"), r => !spec.disable.has(r))
    renderBuildingSelector()
    spec.updateSolution()
}

// Marks toggle buttons as selected, for the style sheet and for screen readers.
function setPressed<T>(toggles: d3.Selection<HTMLButtonElement, T, d3.BaseType, unknown>, pressed: (d: T) => boolean): void {
    toggles.classed("selected", pressed).attr("aria-pressed", d => String(pressed(d)))
}

// Enables or disables the clicked recipe.
function clickRecipeToggle(this: HTMLButtonElement, _event: MouseEvent, d: Recipe): void {
    const disabled = spec.disable.has(d)
    setPressed(d3.select<HTMLButtonElement, Recipe>(this), () => disabled)
    if (disabled) {
        spec.setEnable(d)
    } else {
        spec.setDisable(d)
    }
    spec.updateSolution()
}

function renderRecipes(settings: Settings): void {
    const havePlanets = spec.planets.size > 1
    const planetRow = d3.select("#planet_setting_row")
    if (havePlanets) {
        planetRow.style("display", null)
    } else {
        planetRow.style("display", "none")
    }
    if (havePlanets) {
        const key = settings.get("planet") ?? DEFAULT_PLANET
        const planet = spec.planets.get(key) ?? spec.planets.get(DEFAULT_PLANET)
        if (!spec.planets.has(key)) {
            warnUrl("unknown planet", key)
        }
        if (planet !== undefined) {
            spec.selectPlanet(planet)
        }
    }
    // Which buildings work depends on the planets.
    renderBuildingSelector()

    if (settings.has("disable") || settings.has("enable")) {
        for (const key of splitList(settings.get("disable"))) {
            const recipe = spec.recipes.get(key)
            if (recipe) {
                spec.setDisable(recipe)
            }
        }
        for (const key of splitList(settings.get("enable"))) {
            const recipe = spec.recipes.get(key)
            if (recipe) {
                spec.setEnable(recipe)
            }
        }
    } else if (!havePlanets) {
        spec.setDefaultDisable()
    }

    const planetDiv = d3.select("#planet_selector").classed("toggle-list", true)
    planetDiv.selectAll("*").remove()
    if (havePlanets) {
        const planetToggles = planetDiv.selectAll<HTMLButtonElement, Planet>("button").data(sorted(spec.planets.values(), p => p.order)).join("button")
        planetToggles.attr("type", "button").classed("toggle", true).on("click", clickPlanet)
        setPressed(planetToggles, d => d === spec.planet)
        planetToggles.append(d => iconOf(d).make(ICON_SIZE))
    }

    // Only recipes that compete with another recipe for a product get a toggle.
    const groups: Recipe[][] = []
    for (const group of getRecipeGroups(new Set<RecipeLike>(spec.recipes.values()))) {
        const recipes = Array.from(group).filter((r): r is Recipe => spec.recipes.get(r.key) === r)
        if (group.size > 1) {
            groups.push(sorted(recipes, d => d.order ?? ""))
        }
    }

    const div = d3.select("#recipe_toggles").classed("toggle-list", true)
    div.selectAll("*").remove()
    const toggleRows = div.selectAll<HTMLDivElement, Recipe[]>("div").data(groups).join("div").classed("toggle-row", true)
    const toggles = toggleRows.selectAll<HTMLButtonElement, Recipe>("button").data(d => d).join("button")
    toggles.attr("type", "button").classed("toggle recipe", true).on("click", clickRecipeToggle)
    setPressed(toggles, d => !spec.disable.has(d))
    toggles.append(d => iconOf(d).make(ICON_SIZE))
}

// resource priority

function renderResourcePriorities(settings: Settings): void {
    spec.setDefaultPriority()
    const priority = settings.get("priority")
    if (priority === undefined) {
        return
    }

    const tiers: [string, Rational][][] = []
    for (const tierStr of priority.split(";")) {
        const tier: [string, Rational][] = []
        for (const pair of tierStr.split(",")) {
            const [key = "", weightStr] = pair.split("=")
            if (weightStr === undefined) {
                warnUrl("invalid priority", pair)
                return
            }
            const weight = parseRational(weightStr, "priority weight")
            if (!spec.isValidPriorityKey(key) || weight === null) {
                warnUrl("invalid priority key", key)
                continue
            }
            tier.push([key, weight])
        }
        tiers.push(tier)
    }

    spec.setPriorities(tiers)
}

// debug

function renderDebugCheckbox(settings: Settings): void {
    spec.debug = settings.has("debug")
    d3.select("#render_debug").property("checked", spec.debug)
}

/** Applies all settings and renders their controls. The order matters: buildings before modules, recipes before targets. */
export function renderSettings(settings: Settings): void {
    renderTitle(settings)
    renderIgnore(settings)
    renderRateOptions(settings)
    renderPrecisions(settings)
    renderValueFormat(settings)
    renderMiningProd(settings)
    renderReactorBlock(settings)
    renderResearch(settings)
    renderColorScheme(settings)
    renderBuildings(settings)
    renderQuality(settings)
    renderBelts(settings)
    renderFuel(settings)
    renderVisualizer(settings)
    renderDefaultModule(settings)
    renderDefaultBeacon(settings)
    renderResourcePriorities(settings)
    renderRecipes(settings)
    renderTargets(settings)
    renderModules(settings)
    renderDebugCheckbox(settings)
    renderTab(settings)
}

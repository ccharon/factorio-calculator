// SPDX-FileCopyrightText: 2019 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Entry point: binds the static page controls, loads the dataset and renders the calculator
// from the URL settings.

import "./styles/calc.css"
import "./styles/dropdown.css"
import { getBelts } from "./data/belt.ts"
import { getBuildings } from "./data/building.ts"
import { addRocketCargo } from "./data/cargo.ts"
import type { Dataset } from "./data/dataset.ts"
import { getFuel } from "./data/fuel.ts"
import { getItemGroups } from "./data/group.ts"
import { getItems } from "./data/item.ts"
import { getModules } from "./data/module.ts"
import { getPlanets } from "./data/planet.ts"
import { addPowerRecipes } from "./data/power.ts"
import { getProductivityResearch } from "./data/research.ts"
import { addQualityVariants, getQualities } from "./data/quality.ts"
import { addResources, getRecipes } from "./data/recipe.ts"
import { spec } from "./state/factory.ts"
import { type Settings, decodeFragment } from "./state/url-codec.ts"
import { warnUrl } from "./ui/warnings.ts"
import {
    plusHandler, clickTab, clickVisualize, changeTitle, changeRatePrecision, changeCountPrecision, changeFormat, changeMprod, changeVisType,
    changeVisRender, changeVisDir, changeVisElectricity, toggleDebug, resourceKeyHandler, TAB_NAMES,
} from "./ui/events.ts"
import { getSprites } from "./ui/icon.ts"
import { renderSettings } from "./ui/settings.ts"

const DATASET = "data/space-age-2.1.21.json"

function setStatus(text: string): void {
    const status = document.getElementById("data_version")
    if (status) {
        status.textContent = text
    }
}

// Checks the top-level shape of the dataset. tests/dataset.test.ts validates the full schema.
function isDataset(value: unknown): value is Dataset {
    if (typeof value !== "object" || value === null) {
        return false
    }
    const record = value as Record<string, unknown>
    return typeof record["version"] === "string"
        && ["items", "recipes", "planets", "crafting_machines", "recipe_productivity"].every(key => Array.isArray(record[key]))
}

async function fetchDataset(): Promise<Dataset> {
    const response = await fetch(DATASET, { cache: "reload" })
    if (!response.ok) {
        throw new Error(`${DATASET}: HTTP ${response.status}`)
    }
    const data: unknown = await response.json()
    if (!isDataset(data)) {
        throw new Error(`${DATASET} is not a calculator dataset`)
    }
    return data
}

// Builds the game model from the dataset and renders all settings and the solution.
function loadData(data: Dataset, settings: Settings): void {
    setStatus(data.version)
    const items = getItems(data)
    const recipes = getRecipes(data, items)
    addRocketCargo(data, items, recipes)
    addPowerRecipes(data, items, recipes)
    addResources(items, recipes)
    const qualities = getQualities(data)
    addQualityVariants(items.values(), recipes.values(), qualities)
    const buildings = getBuildings(data, items)
    const planets = getPlanets(data, recipes, buildings)
    const modules = getModules(data, items)
    const belts = getBelts(data)
    const fuel = getFuel(data, items)
    getSprites(data)
    const itemGroups = getItemGroups(items, data)
    const research = getProductivityResearch(data, recipes)
    spec.setData(items, recipes, planets, modules, buildings, belts, fuel, itemGroups, research, qualities)
    renderSettings(settings)
    spec.updateSolution()
}

function on(selector: string, type: string, handler: (event: Event) => void): void {
    for (const element of document.querySelectorAll(selector)) {
        element.addEventListener(type, handler)
    }
}

// Binds the event handlers of the controls that index.html defines statically.
function bindControls(): void {
    on("#plusButton button", "click", () => plusHandler())
    for (const tab of TAB_NAMES.filter(name => name !== "graph")) {
        on(`#${tab}_button`, "click", () => clickTab(tab))
    }
    on("#graph_button", "click", () => clickVisualize())
    on("#graph_type input", "change", changeVisType)
    on("#graph_render input", "change", changeVisRender)
    on("#graph_direction input", "change", changeVisDir)
    on("#graph_electricity", "change", changeVisElectricity)
    on("#title_setting", "input", changeTitle)
    on("#rprec", "change", changeRatePrecision)
    on("#cprec", "change", changeCountPrecision)
    on("#value_format input", "change", changeFormat)
    on("#mprod", "change", changeMprod)
    on("#render_debug", "change", toggleDebug)
    document.addEventListener("keydown", resourceKeyHandler)
}

bindControls()
Promise.all([fetchDataset(), decodeFragment(window.location.hash, warnUrl)]).then(([data, settings]) => loadData(data, settings)).catch((error: unknown) => {
    console.error(error)
    setStatus("failed to load")
})

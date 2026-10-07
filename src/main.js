/*Copyright 2019 Kirk McDonald

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
// Entry point: binds the static page controls, loads the dataset and renders the calculator
// from the URL settings.
import "./styles/calc.css"
import "./styles/dropdown.css"
import { plusHandler, clickTab, clickVisualize, changeTitle, changeRatePrecision, changeCountPrecision, changeFormat, changeMprod, changeVisType, changeVisRender, changeVisDir, toggleDebug } from "./ui/events.js"
import { getBelts } from "./data/belt.ts"
import { getBuildings } from "./data/building.ts"
import { spec } from "./state/factory.js"
import { loadSettings } from "./state/fragment.js"
import { getFuel } from "./data/fuel.ts"
import { getItemGroups } from "./data/group.ts"
import { getSprites } from "./ui/icon.ts"
import { getItems } from "./data/item.ts"
import { getModules } from "./data/module.ts"
import { getPlanets } from "./data/planet.ts"
import { getRecipes } from "./data/recipe.ts"
import { renderSettings } from "./ui/settings.js"

const DATASET = "data/space-age-2.1.21.json"

// Loads the dataset, builds the game model and renders all settings and the solution.
function loadData(settings) {
    d3.json(DATASET, {cache: "reload"}).then(function(data) {
        d3.select("#data_version").text(data.version)
        let items = getItems(data)
        let recipes = getRecipes(data, items)
        let planets = getPlanets(data, recipes)
        let modules = getModules(data, items)
        let buildings = getBuildings(data, items)
        let belts = getBelts(data)
        let fuel = getFuel(data, items)
        getSprites(data)
        let itemGroups = getItemGroups(items, data)
        spec.setData(items, recipes, planets, modules, buildings, belts, fuel, itemGroups)

        renderSettings(settings)

        spec.updateSolution()
    }).catch(error => {
        console.error(error)
        d3.select("#data_version").text("failed to load")
    })
}

function on(selector, type, handler) {
    for (let element of document.querySelectorAll(selector)) {
        element.addEventListener(type, handler)
    }
}

// Binds the event handlers of the controls that index.html defines statically.
function bindControls() {
    on("#plusButton button", "click", () => plusHandler())
    for (let tab of ["totals", "resources", "settings", "faq", "about", "debug"]) {
        on(`#${tab}_button`, "click", () => clickTab(tab))
    }
    on("#graph_button", "click", () => clickVisualize())
    on("#graph_type input", "change", changeVisType)
    on("#graph_render input", "change", changeVisRender)
    on("#graph_direction input", "change", changeVisDir)
    on("#title_setting", "input", changeTitle)
    on("#rprec", "change", changeRatePrecision)
    on("#cprec", "change", changeCountPrecision)
    on("#value_format input", "change", changeFormat)
    on("#mprod", "change", changeMprod)
    on("#render_debug", "change", toggleDebug)
}

bindControls()
loadData(loadSettings(window.location.hash))

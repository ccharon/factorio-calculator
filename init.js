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
// Entry point: loads the dataset and renders the calculator from the URL settings.
import { getBelts } from "./belt.js"
import { getBuildings } from "./building.js"
import { spec } from "./factory.js"
import { loadSettings } from "./fragment.js"
import { getFuel } from "./fuel.js"
import { getItemGroups } from "./group.js"
import { getSprites } from "./icon.js"
import { getItems } from "./item.js"
import { getModules } from "./module.js"
import { getPlanets } from "./planet.js"
import { getRecipes } from "./recipe.js"
import { renderSettings } from "./settings.js"

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
    })
}

// Called once on page load.
export function init() {
    let settings = loadSettings(window.location.hash)
    loadData(settings)
}

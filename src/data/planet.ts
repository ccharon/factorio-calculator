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
import type { IconSource } from "./icon-source.ts"
import type { Dataset } from "./dataset.ts"
import type { Building } from "./building.ts"
import { GeneratorRecipe, SolarRecipe } from "./power.ts"
import { ELECTRICITY, HEAT, type Recipe } from "./recipe.ts"

/** A planet or space surface with its resources and surface properties. */
export class Planet implements IconSource {
    readonly key: string
    readonly name: string
    readonly order: string
    /** Recipes that extract this planet's resources: mining, pumping and plants. */
    readonly resources: ReadonlySet<Recipe>
    /** Surface property values, including defaults for properties the planet does not set. */
    readonly properties: ReadonlyMap<string, number>
    /** True if buildings freeze here without heat. */
    readonly requiresHeating: boolean
    /** Recipes that are disabled while only this planet is selected. Generators are always among them until the user enables them. */
    readonly disable: Set<Recipe> = new Set()
    readonly icon_col: number
    readonly icon_row: number

    constructor(key: string, name: string, order: string, col: number, row: number, resources: ReadonlySet<Recipe>, properties: ReadonlyMap<string, number>, requiresHeating: boolean) {
        this.key = key
        this.name = name
        this.order = order
        this.resources = resources
        this.properties = properties
        this.requiresHeating = requiresHeating
        this.icon_col = col
        this.icon_row = row
    }

    /**
     * Returns whether recipe can run on this planet: resources must exist here, the surface
     * conditions of the recipe must hold, and one of the buildings that craft it must work here.
     */
    allows(recipe: Recipe, buildings: readonly Building[]): boolean {
        if (recipe.isResource()) {
            // Electricity comes from outside the factory on every surface.
            return this.resources.has(recipe) || recipe.key === ELECTRICITY || recipe.key === HEAT
        }
        if (recipe instanceof SolarRecipe && recipe.planet !== this.key) {
            return false
        }
        if (!recipe.conditions.every(c => c.holds(this.properties))) {
            return false
        }
        return recipe.categories.length === 0 || buildings.some(b => b.canCraft(recipe) && b.worksOn(this.properties))
    }
}

// Recycling recipes are disabled on every planet, except those reachable from these resources.
const RECYCLING_ROOT_KEYS = new Set(["scrap"])

function isRecycling(recipe: Recipe): boolean {
    return recipe.key.endsWith("-recycling")
}

// Adds every recycling recipe reachable from the products of recipe to found.
function traverseRecycling(recipe: Recipe, found: Set<Recipe>): void {
    for (const { item } of recipe.products) {
        for (const subrecipe of item.uses) {
            if (isRecycling(subrecipe) && !found.has(subrecipe)) {
                found.add(subrecipe)
                traverseRecycling(subrecipe, found)
            }
        }
    }
}

// Generators and heat sources stay disabled until the user enables them, because a free source
// such as solar power would always win.
function isEnergySource(recipe: Recipe): boolean {
    return recipe instanceof GeneratorRecipe || (!recipe.isResource() && recipe.products.some(p => p.item.key === HEAT))
}

/** Creates all planets and space surfaces by key, each with the set of recipes it disables. */
export function getPlanets(data: Dataset, recipes: ReadonlyMap<string, Recipe>, buildings: readonly Building[]): Map<string, Planet> {
    const planets = new Map<string, Planet>()
    for (const d of data.planets) {
        const resources = new Set<Recipe>()
        const recyclingRoots: Recipe[] = []
        for (const key of [...d.resources.resource, ...d.resources.offshore, ...d.resources.plants, ...d.resources.asteroid]) {
            const r = recipes.get(key)
            if (r === undefined) {
                throw new Error(`planet ${d.key} has unknown resource ${key}`)
            }
            resources.add(r)
            if (RECYCLING_ROOT_KEYS.has(key)) {
                recyclingRoots.push(r)
            }
        }

        const properties = new Map<string, number>()
        for (const { name, default_value } of data.surface_properties) {
            properties.set(name, d.surface_properties[name] ?? default_value)
        }

        const planet = new Planet(d.key, d.localized_name.en, d.order, d.icon_col, d.icon_row, resources, properties, d.requires_heating)
        for (const recipe of recipes.values()) {
            if (!planet.allows(recipe, buildings) || isRecycling(recipe) || isEnergySource(recipe)) {
                planet.disable.add(recipe)
            }
        }

        const allowedRecycling = new Set<Recipe>()
        for (const root of recyclingRoots) {
            traverseRecycling(root, allowedRecycling)
        }
        for (const recipe of allowedRecycling) {
            planet.disable.delete(recipe)
        }

        planets.set(planet.key, planet)
    }

    return planets
}

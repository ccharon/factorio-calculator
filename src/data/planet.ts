// SPDX-FileCopyrightText: 2024 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import type { IconSource } from "./icon-source.ts"
import type { Dataset } from "./dataset.ts"
import type { Building } from "./building.ts"
import { SPACE_PLATFORM, TICKS_PER_SECOND } from "./game.ts"
import type { Item } from "./item.ts"
import { GeneratorRecipe, SolarRecipe } from "./power.ts"
import { HEAT, type Recipe, isEnergyKey } from "./recipe.ts"

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

    /**
     * Recipes that are disabled on this planet: those that cannot run here or need an ingredient that
     * can neither be made here nor imported. Generators are among them until the user enables them.
     */
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
     * Returns whether item can come from elsewhere: a solid item that fits into a rocket. A space
     * platform gets it straight from the planet below. A planet gets it from another planet, which
     * takes too long for items that spoil within an hour.
     */
    imports(item: Item): boolean {
        if (item.orbit === null) {
            return false
        }
        return this.key === SPACE_PLATFORM || item.spoilTicks === null || item.spoilTicks >= MIN_TRAVEL_SPOIL_TICKS
    }

    /**
     * Returns whether recipe can run on this planet: resources must exist here, the surface
     * conditions of the recipe must hold, and one of the buildings that craft it must work here.
     */
    allows(recipe: Recipe, buildings: readonly Building[]): boolean {
        if (recipe.isResource()) {
            // Electricity and heat come from outside the factory on every surface.
            return this.resources.has(recipe) || isEnergyKey(recipe.key)
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

// Items that spoil sooner than this cannot travel between planets.
const MIN_TRAVEL_SPOIL_TICKS = 60 * 60 * TICKS_PER_SECOND

// Returns the recipes among allowed whose ingredients can all be made on planet or imported.
// A recipe counts once its ingredients do, so chains are followed from the resources up. A recipe
// that also produces an ingredient, such as egg breeding, needs it only once to start.
function reachableRecipes(planet: Planet, allowed: readonly Recipe[]): Set<Recipe> {
    const reachable = new Set<Recipe>()
    const available = new Set<Item>()
    let changed = true
    while (changed) {
        changed = false
        for (const recipe of allowed) {
            const obtainable = (item: Item): boolean => available.has(item) || planet.imports(item) || recipe.products.some(p => p.item === item)
            if (reachable.has(recipe) || !recipe.ingredients.every(ing => obtainable(ing.item))) {
                continue
            }
            reachable.add(recipe)
            for (const { item } of recipe.products) {
                available.add(item)
            }
            changed = true
        }
    }
    return reachable
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
        const allowedRecycling = new Set<Recipe>()
        for (const root of recyclingRoots) {
            traverseRecycling(root, allowedRecycling)
        }

        // Recycling that stays disabled cannot make ingredients for other recipes.
        const candidates = Array.from(recipes.values()).filter(r => planet.allows(r, buildings) && (!isRecycling(r) || allowedRecycling.has(r)))
        const reachable = reachableRecipes(planet, candidates)
        for (const recipe of recipes.values()) {
            if (!reachable.has(recipe) || isEnergySource(recipe)) {
                planet.disable.add(recipe)
            }
        }

        planets.set(planet.key, planet)
    }

    return planets
}

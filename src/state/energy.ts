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
// Energy use of buildings: fuel, electricity and heat per craft, and power use for display.

import { Rational, zero, one } from "../core/rational.ts"
import type { Building } from "../data/building.ts"
import type { Item } from "../data/item.ts"
import type { ModuleSpec } from "../data/module.ts"
import type { Planet } from "../data/planet.ts"
import type { QualityContext } from "../data/quality.ts"
import { ELECTRICITY_UNIT, Ingredient, type Recipe, type RecipeNode } from "../data/recipe.ts"
import type { FuelChoice } from "./fuel-choice.ts"

/** What the energy calculations need from the factory state. FactorySpecification implements it. */
export interface EnergyContext extends QualityContext {
    readonly fuel: FuelChoice
    readonly selectedPlanets: ReadonlySet<Planet>
    /** The abstract item for heat, in MJ. */
    readonly heat: Item
    /** The abstract item for electric energy, in MJ. */
    readonly electricity: Item
    getBuilding(recipe: RecipeNode): Building | null
    getRecipeRate(recipe: RecipeNode): Rational | null
    getCount(recipe: RecipeNode, rate: Rational): Rational
    getModuleSpec(recipe: RecipeNode): ModuleSpec | undefined
}

/**
 * Returns the average number of active neighbours of a nuclear reactor in a block of two rows with
 * blockLength reactors each. 0 stands for a single reactor.
 */
export function reactorNeighbours(blockLength: number): Rational {
    if (blockLength === 0) {
        return zero
    }
    // 2N reactors share N vertical and 2(N-1) horizontal contacts, and each contact counts for two reactors.
    return Rational.from_float(3).sub(Rational.from_floats(2, blockLength))
}

/** Power use of a recipe: the fuel category of burner buildings, "electric", or null without building. */
export interface PowerUsage {
    fuel: string | null
    /** W, or for burner buildings J/s of fuel. */
    power: Rational
}

/**
 * Returns the fuel or electricity the building of recipe uses per craft, or an empty list.
 * Electricity includes module effects and the idle drain of the buildings in use. On planets that
 * require heating, buildings also use heat.
 */
export function getEnergyIngredients(context: EnergyContext, recipe: Recipe): Ingredient[] {
    const building = context.getBuilding(recipe)
    const baseRate = context.getRecipeRate(recipe)
    if (building === null || baseRate === null) {
        return []
    }
    const heating = requiresHeating(context.selectedPlanets) && !building.heatingEnergy.isZero()
        ? [new Ingredient(context.heat, building.heatingEnergy.div(baseRate).div(ELECTRICITY_UNIT))]
        : []
    if (building.power.isZero()) {
        return heating
    }

    // craft/s and J/s give J/craft. Divided by J/item, that is items per craft.
    if (building.fuel !== null) {
        const fuel = context.fuel.get(building.fuel)
        return [new Ingredient(fuel.item, building.power.div(baseRate).div(fuel.value)), ...heating]
    }
    const powerEffect = context.getModuleSpec(recipe)?.powerEffect(context) ?? one
    const watts = building.power.mul(powerEffect).add(building.drain())
    return [new Ingredient(context.electricity, watts.div(baseRate).div(ELECTRICITY_UNIT)), ...heating]
}

/** Returns whether buildings need heat: every selected planet requires heating. */
function requiresHeating(planets: ReadonlySet<Planet>): boolean {
    return planets.size > 0 && Array.from(planets).every(p => p.requiresHeating)
}

/** Returns the power use of recipe at rate crafts per second, including module effects and idle drain. */
export function getPowerUsage(context: EnergyContext, recipe: RecipeNode, rate: Rational): PowerUsage {
    const building = context.getBuilding(recipe)
    if (building === null) {
        return { fuel: null, power: zero }
    }

    const count = context.getCount(recipe, rate)
    if (building.fuel !== null) {
        return { fuel: building.fuel, power: building.power.mul(count) }
    }

    const powerEffect = context.getModuleSpec(recipe)?.powerEffect(context) ?? one
    const power = building.power.mul(count).mul(powerEffect).add(building.drain().mul(count.ceil()))
    return { fuel: "electric", power }
}

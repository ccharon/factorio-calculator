// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

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
    readonly planet: Planet | null
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
    const heating = context.planet !== null && context.planet.requiresHeating && !building.heatingEnergy.isZero()
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
    const watts = building.workingPower(baseRate).mul(powerEffect).add(building.drain())
    return [new Ingredient(context.electricity, watts.div(baseRate).div(ELECTRICITY_UNIT)), ...heating]
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

    const baseRate = context.getRecipeRate(recipe)
    const working = baseRate === null ? building.power : building.workingPower(baseRate)
    const powerEffect = context.getModuleSpec(recipe)?.powerEffect(context) ?? one
    const power = working.mul(count).mul(powerEffect).add(building.drain().mul(count.ceil()))
    return { fuel: "electric", power }
}

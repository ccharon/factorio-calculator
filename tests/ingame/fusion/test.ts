// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Fusion power: a fusion reactor whose plasma runs fusion generators. build.lua in this directory
// builds it.

import { type Calculator } from "../framework/calculator.ts"
import { type FactoryData, type FactoryResult, type IngameTest, type Measured, absolute, counter, relative } from "../framework/test.ts"

/** A fusion reactor and the generators its plasma runs. */
interface FusionFactory extends FactoryData {
    readonly reactor: string
    readonly generator: string
    readonly fuel: string
    /** Number of generators in the game. The test checks that the calculator needs the same number. */
    readonly generators: number
}

/** What the calculator computes for one reactor and the generators its plasma runs. */
interface Expected {
    /** Fuel power of the reactor in W. */
    readonly fuelPower: number
    /** Electric power that the reactor takes in W. */
    readonly reactorPower: number
    /** Electric power of the generators in W. */
    readonly electricPower: number
    readonly generators: number
}

const ENERGY_TOLERANCE = 0.005

const FACTORIES: readonly FusionFactory[] = [
    { name: "fusion-reactor-generators", reactor: "fusion-reactor", generator: "fusion-generator", fuel: "fusion-power-cell", generators: 2 },
]

// Runs in the page: one reactor and its generators. arg is the reactor recipe and the generator recipe.
function readFusion(arg: string): Expected | null {
    const [reactorKey = "", generatorKey = ""] = arg.split(" ")
    const spec = window.spec
    const reactor = spec.recipes.get(reactorKey)
    const generator = spec.recipes.get(generatorKey)
    const crafts = reactor === undefined ? null : spec.getRecipeRate(reactor)
    const cell = reactor?.ingredients.find(ing => spec.fuel.fuels.has(ing.item.key))
    const fuel = cell === undefined ? undefined : spec.fuel.fuels.get(cell.item.key)
    const plasma = reactor?.products[0]
    const plasmaIn = generator?.ingredients[0]?.amount
    const electricity = generator?.products.find(ing => ing.item.key === "electricity")
    if (reactor === undefined || generator === undefined || crafts === null || cell === undefined || fuel === undefined
        || plasma === undefined || plasmaIn === undefined || electricity === undefined) {
        return null
    }
    const generatorCrafts = crafts.mul(plasma.amount).div(plasmaIn)
    // Electricity is in MJ.
    return {
        fuelPower: crafts.mul(cell.amount).mul(fuel.value).toFloat(),
        reactorPower: spec.getPowerUsage(reactor, crafts).power.toFloat(),
        electricPower: generatorCrafts.mul(electricity.amount).toFloat() * 1e6,
        generators: spec.getCount(generator, generatorCrafts).toFloat(),
    }
}

/** Fusion power. */
export const fusion: IngameTest<FusionFactory> = {
    module: "fusion",
    factories: FACTORIES,

    async compare(factory: FusionFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        const reactorRecipe = `${factory.reactor}-plasma`
        const generatorRecipe = `${factory.generator}-power`
        const fragment = `#items=fusion-plasma:f:1:${reactorRecipe}&planet=nauvis&enable=${reactorRecipe},${generatorRecipe}`
        const expected = await calculator.evaluate(fragment, readFusion, `${reactorRecipe} ${generatorRecipe}`)
        const seconds = counter(measured, "seconds")
        return {
            fragment,
            comparisons: [
                relative("reactor fuel energy (J)", counter(measured, "fuel_energy"), expected.fuelPower * seconds, ENERGY_TOLERANCE),
                relative("reactor electric energy (J)", counter(measured, "reactor_energy"), expected.reactorPower * seconds, ENERGY_TOLERANCE),
                relative("generator electric energy (J)", counter(measured, "electric_energy"), expected.electricPower * seconds, ENERGY_TOLERANCE),
                absolute("generators", factory.generators, Math.ceil(expected.generators), 0),
            ],
        }
    },
}

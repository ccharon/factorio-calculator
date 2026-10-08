// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Nuclear reactors alone and in blocks of two rows, where neighbours raise the heat output.
// build.lua in this directory builds them.

import { type Calculator } from "../framework/calculator.ts"
import { type FactoryData, type FactoryResult, type IngameTest, type Measured, counter, relative } from "../framework/test.ts"

/** A block of reactors in rows, each reactor touching its neighbours. */
interface ReactorFactory extends FactoryData {
    readonly machine: string
    readonly fuel: string
    readonly rows: number
    readonly columns: number
}

/** What the calculator computes for one reactor, averaged over the block. */
interface Expected {
    /** Heat in W. */
    readonly heat: number
    /** Fuel power in W. */
    readonly fuelPower: number
}

// Heat and fuel buffers make the measured energy differ slightly.
const ENERGY_TOLERANCE = 0.005

const reactor = { machine: "nuclear-reactor", fuel: "uranium-fuel-cell" }

const FACTORIES: readonly ReactorFactory[] = [
    { name: "nuclear-reactor-single", ...reactor, rows: 1, columns: 1 },
    { name: "nuclear-reactor-2x2", ...reactor, rows: 2, columns: 2 },
    { name: "nuclear-reactor-2x3", ...reactor, rows: 2, columns: 3 },
]

// Runs in the page: heat and fuel power of one reactor of the block that the reactors setting describes.
function readReactor(recipeKey: string): Expected | null {
    const spec = window.spec
    const recipe = spec.recipes.get(recipeKey)
    const crafts = recipe === undefined ? null : spec.getRecipeRate(recipe)
    const cell = recipe?.ingredients[0]
    const fuel = cell === undefined ? undefined : spec.fuel.fuels.get(cell.item.key)
    if (recipe === undefined || crafts === null || cell === undefined || fuel === undefined) {
        return null
    }
    const prodEffect = spec.getProdEffect(recipe)
    const heat = spec.getProducts(recipe).find(ing => ing.item.key === "heat")
    if (heat === undefined) {
        return null
    }
    // Heat is in MJ.
    return {
        heat: crafts.mul(heat.productAmount(prodEffect)).toFloat() * 1e6,
        fuelPower: crafts.mul(cell.amount).mul(fuel.value).toFloat(),
    }
}

/** Nuclear reactors. */
export const nuclear: IngameTest<ReactorFactory> = {
    module: "nuclear",
    factories: FACTORIES,

    async compare(factory: ReactorFactory, measured: Measured, calculator: Calculator): Promise<FactoryResult> {
        // The reactors setting is the length of a block of two rows, or 0 for a single reactor.
        const block = factory.rows === 1 ? 0 : factory.columns
        const fragment = `#items=heat:f:1:nuclear-reactor-cycle&planet=nauvis&enable=nuclear-reactor-cycle&reactors=${block}`
        const expected = await calculator.evaluate(fragment, readReactor, "nuclear-reactor-cycle")
        const seconds = counter(measured, "seconds")
        const reactors = factory.rows * factory.columns
        return {
            fragment,
            comparisons: [
                relative("heat per reactor (J)", counter(measured, "heat") / reactors, expected.heat * seconds, ENERGY_TOLERANCE),
                relative("fuel energy per reactor (J)", counter(measured, "fuel_energy") / reactors, expected.fuelPower * seconds, ENERGY_TOLERANCE),
            ],
        }
    },
}

// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Power generation as recipes: generators turn steam into electricity, solar panels produce it,
// and heat exchangers turn reactor heat into hot steam.
import { Rational, one } from "../core/rational.ts"
import type { Dataset } from "./dataset.ts"
import type { IconSource } from "./icon-source.ts"
import { Item } from "./item.ts"
import { ELECTRICITY, ELECTRICITY_UNIT, HEAT, Ingredient, Recipe, requireItem } from "./recipe.ts"

/** Crafting category of the heat exchanger recipe. */
export const HEAT_EXCHANGE_CATEGORY = "heat-exchange"

/** Returns the crafting category of the recipe that a generator or solar panel runs. */
export function powerCategory(key: string): string {
    return `power-${key}`
}

/**
 * A recipe that produces electricity. Generators are disabled on every planet until the user
 * enables them, because a free source such as solar power would always win.
 */
export class GeneratorRecipe extends Recipe {
    constructor(key: string, name: string, icon: Pick<IconSource, "icon_col" | "icon_row">, category: string, time: Rational, ingredients: Ingredient[], products: Ingredient[]) {
        super({
            key,
            name,
            order: undefined,
            icon_col: icon.icon_col,
            icon_row: icon.icon_row,
            allowProductivity: false,
            categories: [category],
            time,
            ingredients,
            products,
            iconName: name,
        })
    }
}

/** Solar power on one planet. It runs only there, because light differs between planets. */
export class SolarRecipe extends GeneratorRecipe {
    readonly planet: string

    constructor(planet: string, ...args: ConstructorParameters<typeof GeneratorRecipe>) {
        super(...args)
        this.planet = planet
    }
}

// Joules per unit of a fluid heated from its default temperature.
function fluidEnergy(data: Dataset, key: string, temperature: number): Rational {
    const fluid = data.fluids.find(f => f.item_key === key)

    if (fluid === undefined) {
        throw new Error(`dataset lacks the fluid ${key}`)
    }

    return Rational.from_float_approximate((temperature - fluid.default_temperature) * fluid.heat_capacity)
}

/**
 * Adds hot steam, the heat exchanger recipe, one recipe per generator and one solar recipe per
 * planet. Generators burn the hottest steam they accept.
 */
export function addPowerRecipes(data: Dataset, items: Map<string, Item>, recipes: Map<string, Recipe>): void {
    const item = (key: string): Item => requireItem(items, key)
    const electricity = item(ELECTRICITY)
    const steam = item("steam")
    const water = item("water")

    // Steam by temperature: boilers make plain steam, heat exchangers make hot steam.
    const steamByTemperature = new Map<number, Item>()
    for (const boiler of data.boilers) {
        if (boiler.energy_source.type !== "heat") {
            steamByTemperature.set(boiler.target_temperature, steam)
            continue
        }
        const key = `steam-${boiler.target_temperature}`
        const hot = new Item(key, `${steam.name} (${boiler.target_temperature}°C)`, steam.icon_col, steam.icon_row, "fluid", steam.group, steam.subgroup, steam.order)
        items.set(key, hot)
        steamByTemperature.set(boiler.target_temperature, hot)

        // Heat per unit of steam, and the time one exchanger needs for it.
        const energy = fluidEnergy(data, "steam", boiler.target_temperature)
        const time = energy.div(Rational.from_float(boiler.energy_consumption))
        const icon = { name: boiler.localized_name.en, icon_col: boiler.icon_col, icon_row: boiler.icon_row }
        recipes.set(key, new Recipe({
            key, name: hot.name, order: steam.order, icon_col: icon.icon_col, icon_row: icon.icon_row, allowProductivity: false,
            categories: [HEAT_EXCHANGE_CATEGORY], time,
            ingredients: [new Ingredient(water, one), new Ingredient(item(HEAT), energy.div(ELECTRICITY_UNIT))],
            products: [new Ingredient(hot, one)],
        }))
    }

    for (const g of data.generators) {
        const temperature = Math.max(...Array.from(steamByTemperature.keys()).filter(t => t <= g.maximum_temperature))
        const fuel = steamByTemperature.get(temperature)
        if (fuel === undefined || g.fluid !== "steam") {
            continue
        }
        const energy = fluidEnergy(data, "steam", temperature).mul(Rational.from_float_approximate(g.effectivity))
        const key = `${g.key}-power`
        recipes.set(key, new GeneratorRecipe(
            key, g.localized_name.en, g, powerCategory(g.key), Rational.from_float_approximate(g.fluid_usage).reciprocate(),
            [new Ingredient(fuel, one)], [new Ingredient(electricity, energy.div(ELECTRICITY_UNIT))],
        ))
    }

    for (const r of data.reactors.filter(d => d.key !== "nuclear-reactor")) {
        // The reactor turns its fuel consumption into heat at its effectivity.
        const heat = Rational.from_float(r.consumption).mul(Rational.from_float_approximate(r.energy_source.effectivity ?? 1))
        const key = `${r.key}-heat`
        recipes.set(key, new Recipe({
            key, name: r.localized_name.en, order: undefined, icon_col: r.icon_col, icon_row: r.icon_row, allowProductivity: false,
            categories: [powerCategory(r.key)], time: one, ingredients: [], products: [new Ingredient(item(HEAT), heat.div(ELECTRICITY_UNIT))],
        }))
    }

    // Fusion generators fix the energy of one plasma unit: their full output over their plasma flow.
    for (const g of data.fusion_generators) {
        const plasmaEnergy = Rational.from_float(g.max_power_output).div(Rational.from_float_approximate(g.fluid_usage))
        const key = `${g.key}-power`
        recipes.set(key, new GeneratorRecipe(
            key, g.localized_name.en, g, powerCategory(g.key), Rational.from_float_approximate(g.fluid_usage).reciprocate(),
            [new Ingredient(item(g.input_fluid), one)],
            [new Ingredient(electricity, plasmaEnergy.div(ELECTRICITY_UNIT)), new Ingredient(item(g.output_fluid), one)],
        ))

        // The reactor burns fuel for the energy of the plasma it makes, besides its electric power.
        for (const r of data.fusion_reactors.filter(d => d.output_fluid === g.input_fluid)) {
            const category = r.burner.fuel_categories?.[0] ?? r.burner.fuel_category
            const fuel = data.fuel.find(f => category !== undefined && f.categories.includes(category))
            if (fuel === undefined) {
                throw new Error(`no fuel for ${r.key}`)
            }
            const flow = Rational.from_float_approximate(r.fluid_usage)
            const fuelPerSecond = flow.mul(plasmaEnergy).div(Rational.from_float_approximate(r.burner.effectivity ?? 1)).div(Rational.from_float(fuel.value))
            const reactorKey = `${r.key}-plasma`
            recipes.set(reactorKey, new Recipe({
                key: reactorKey, name: r.localized_name.en, order: undefined, icon_col: r.icon_col, icon_row: r.icon_row, allowProductivity: false,
                categories: [powerCategory(r.key)], time: one,
                ingredients: [new Ingredient(item(r.input_fluid), flow), new Ingredient(item(fuel.item_key), fuelPerSecond)],
                products: [new Ingredient(item(r.output_fluid), flow)],
            }))
        }
    }

    const defaults = new Map(data.surface_properties.map(p => [p.name, p.default_value]))
    for (const panel of data.solar_panels) {
        for (const planet of data.planets) {
            const solarPower = planet.surface_properties["solar-power"] ?? defaults.get("solar-power") ?? 100
            const watts = Rational.from_float_approximate(panel.production * solarPower / 100 * planet.solar_factor)
            const key = `${panel.key}-${planet.key}`

            recipes.set(key, new SolarRecipe(
                planet.key, key, `${panel.localized_name.en} (${planet.localized_name.en})`, panel, powerCategory(panel.key), one,
                [], [new Ingredient(electricity, watts.div(ELECTRICITY_UNIT))],
            ))
        }
    }
}


// Rocket cargo: pseudo items for items launched into orbit, and the recipes that launch them.
import { Rational, zero } from "../core/rational.ts"
import type { Dataset } from "./dataset.ts"
import { Item } from "./item.ts"
import { Ingredient, Recipe, requireItem } from "./recipe.ts"

/** Suffix of the key of an item in orbit. */
export const ORBIT_SUFFIX = "-in-orbit"

/**
 * Pseudo-recipe for one rocket launch with a full load of one item. It has no building: the rocket
 * silo counts as the building of the rocket parts, and their rate includes the launch pause.
 */
class LaunchRecipe extends Recipe {
    constructor(item: Item, orbit: Item, perRocket: Rational, rocketPart: Item, partsPerLaunch: Rational) {
        super({
            key: `launch-${item.key}`,
            name: `Launch ${item.name}`,
            order: item.order,
            icon_col: item.icon_col,
            icon_row: item.icon_row,
            allowProductivity: false,
            categories: [],
            time: zero,
            ingredients: [new Ingredient(item, perRocket), new Ingredient(rocketPart, partsPerLaunch)],
            products: [new Ingredient(orbit, perRocket)],
        })
    }
}

/**
 * Adds an item in orbit and a launch recipe for every solid item that fits into a rocket. A rocket
 * carries as many items as fit into the lift weight.
 */
export function addRocketCargo(data: Dataset, items: Map<string, Item>, recipes: Map<string, Recipe>): void {
    const silo = data.rocket_silo[0]
    if (silo === undefined) {
        throw new Error("dataset lacks the rocket silo")
    }
    const rocketPart = requireItem(items, "rocket-part")
    const partsPerLaunch = Rational.from_float(silo.rocket_parts_required)

    for (const item of Array.from(items.values())) {
        if (item.phase !== "solid" || item.weight === null || item.weight <= 0) {
            continue
        }
        const count = Math.floor(data.rocket_lift_weight / item.weight)
        if (count < 1) {
            continue
        }
        const orbit = new Item(item.key + ORBIT_SUFFIX, `${item.name} (in orbit)`, item.icon_col, item.icon_row, "solid", item.group, item.subgroup, item.order)
        orbit.ground = item
        item.orbit = orbit
        items.set(orbit.key, orbit)
        const recipe = new LaunchRecipe(item, orbit, Rational.from_float(count), rocketPart, partsPerLaunch)
        recipes.set(recipe.key, recipe)
    }
}

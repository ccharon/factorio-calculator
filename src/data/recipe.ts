/*Copyright 2019-2021 Kirk McDonald

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
import { Rational, zero, one } from "../core/rational.ts"
import { spec } from "../state/factory.ts"
import { Icon, type IconSource, getSprite } from "../ui/icon.ts"
import type { Dataset, DatasetProduct, DatasetRecipe, SurfaceConditionData } from "./dataset.ts"
import type { Item } from "./item.ts"

/** Returns the item with this key. Throws if the dataset has no such item. */
export function requireItem(items: ReadonlyMap<string, Item>, key: string): Item {
    const item = items.get(key)
    if (item === undefined) {
        throw new Error(`unknown item: ${key}`)
    }
    return item
}

/** An amount of an item that a recipe uses or produces per craft. */
export class Ingredient {
    readonly item: Item
    readonly amount: Rational

    constructor(item: Item, amount: Rational) {
        this.item = item
        this.amount = amount
    }
}

/** A surface property range that a recipe requires, such as pressure between 1000 and 1000. */
export class SurfaceCondition {
    readonly property: string
    readonly min: number | undefined
    readonly max: number | undefined

    constructor({ property, min, max }: SurfaceConditionData) {
        this.property = property
        this.min = min
        this.max = max
    }
}

/** A node of the solution graph: a recipe, or the solver's output and surplus nodes. */
export interface RecipeNode {
    readonly name: string
    readonly ingredients: readonly Ingredient[]
    readonly products: readonly Ingredient[]
    getIngredients(): Ingredient[]
    gives(item: Item): Rational
    /** Returns true for game recipes and false for the solver's output and surplus nodes. */
    isReal(): boolean
}

/** What the solver and the UI need from any recipe, including DisabledRecipe. */
export interface RecipeLike extends RecipeNode, IconSource {
    readonly key: string
    /** Crafting category that selects the building, or null for recipes without a building. */
    readonly category: string | null
    readonly icon: Icon
    isResource(): boolean
    isDisable(): boolean
}

/** Constructor options of Recipe. */
export interface RecipeOptions {
    key: string
    name: string
    /** Sort order. Undefined sorts like an equal key. */
    order: string | undefined
    icon_col: number
    icon_row: number
    allowProductivity: boolean
    category: string | null
    /** Crafting time in seconds at crafting speed 1. */
    time: Rational
    ingredients: Ingredient[]
    products: Ingredient[]
    conditions?: SurfaceCondition[]
    /** Alt text of the icon. Defaults to the name of the first product. */
    iconName?: string
}

/** A crafting recipe. Also the base class for pseudo-recipes such as mining and pumping. */
export class Recipe implements RecipeLike {
    readonly key: string
    readonly name: string
    readonly order: string | undefined
    readonly allow_productivity: boolean
    readonly category: string | null
    readonly time: Rational
    readonly ingredients: Ingredient[]
    readonly products: Ingredient[]
    readonly conditions: SurfaceCondition[]
    readonly icon_col: number
    readonly icon_row: number
    readonly icon: Icon
    /** Priority level in the Resources tab, for recipes that extract resources. */
    defaultPriority: number | undefined
    /** Weight within its priority level, for recipes that extract resources. */
    defaultWeight: Rational | undefined

    constructor(options: RecipeOptions) {
        this.key = options.key
        this.name = options.name
        this.order = options.order
        this.allow_productivity = options.allowProductivity
        this.category = options.category
        this.time = options.time
        this.ingredients = options.ingredients
        for (const ing of this.ingredients) {
            ing.item.addUse(this)
        }
        this.products = options.products
        for (const ing of this.products) {
            ing.item.addRecipe(this)
        }
        this.conditions = options.conditions ?? []
        this.icon_col = options.icon_col
        this.icon_row = options.icon_row
        this.icon = new Icon(this, options.iconName ?? this.products[0]?.item.name)
    }

    /** Returns the fuel a burner building burns per craft as an extra ingredient, or an empty list. */
    fuelIngredient(): Ingredient[] {
        const building = spec.getBuilding(this)
        if (building === null || building.fuel !== "chemical") {
            return []
        }
        // craft/s and J/s give J/craft. Divided by J/item, that is items per craft.
        const baseRate = spec.getRecipeRate(this)
        if (baseRate === null) {
            return []
        }
        const basePower = spec.getPowerUsage(this, baseRate).power
        const perCraftEnergy = basePower.div(baseRate)
        const fuelAmount = perCraftEnergy.div(spec.fuel.value)
        return [new Ingredient(spec.fuel.item, fuelAmount)]
    }

    /** Returns the ingredients including fuel. */
    getIngredients(): Ingredient[] {
        return this.ingredients.concat(this.fuelIngredient())
    }

    /** Returns the amount of item produced per craft, including productivity. Throws if the recipe does not produce item. */
    gives(item: Item): Rational {
        const prodEffect = spec.getProdEffect(this).sub(one)
        for (const ing of this.products) {
            if (ing.item === item) {
                if (!prodEffect.isZero()) {
                    // The productivity bonus applies to the net output only.
                    const net = ing.amount.sub(this.uses(item))
                    if (net.less(zero)) {
                        return ing.amount
                    }
                    return ing.amount.add(net.mul(prodEffect))
                }
                return ing.amount
            }
        }
        throw new Error(`recipe ${this.key} does not give ${item.key}`)
    }

    /** Returns the amount of item used per craft including fuel, or zero. Unlike gives(), it never throws. */
    uses(item: Item): Rational {
        for (const ing of this.getIngredients()) {
            if (ing.item === item) {
                return ing.amount
            }
        }
        return zero
    }

    /** Returns whether one craft produces more of item than it uses. */
    isNetProducer(item: Item): boolean {
        return zero.less(this.gives(item).sub(this.uses(item)))
    }

    /** Returns whether this recipe extracts a raw resource. Resources appear in the Resources tab. */
    isResource(): boolean {
        return false
    }

    /** Returns true for game recipes and false for the solver's output and surplus nodes. */
    isReal(): boolean {
        return true
    }

    /** Returns whether this is the DisabledRecipe of an item. */
    isDisable(): boolean {
        return false
    }

    /** Returns a tooltip element with products, crafting time and ingredients. */
    renderTooltip(extra?: Node): HTMLDivElement {
        const t = d3.create("div")
            .classed("frame recipe", true)
            .datum(this)
        const header = t.append("h3")
        header.append(() => this.icon.make(32, true))
        let name = this.name
        const first = this.products[0]
        if (this.products.length === 1 && first !== undefined && first.item.name === this.name && one.less(first.amount)) {
            name = `${first.amount.toDecimal()} \u00d7 ${name}`
        }
        header.node()?.append("\u00A0" + name)
        if (extra) {
            t.node()?.append(extra)
        }
        const node = t.node() as HTMLDivElement
        if (this.ingredients.length === 0) {
            return node
        }
        if (this.products.length > 1 || first?.item.name !== this.name) {
            const productLine = t.append("div")
            productLine.append("span")
                .text("Products:")
            const product = productLine.append("span").selectAll("span")
                .data(this.products)
                .join("span")
            product.append("span")
                .text("\u00A0")
            const prodIcon = product.append("div")
                .classed("product", true)
            prodIcon.append(d => d.item.icon.make(32, true))
            prodIcon.append("span")
                .classed("count", true)
                .text(d => d.amount.toDecimal())
        }
        const time = t.append("div")
        time.append("div")
            .classed("product", true)
            .append(() => getSprite("clock").icon.make(32, true))
        time.append("span")
            .text("\u00A0" + this.time.toDecimal())
        const ingredient = t.append("div").selectAll("div")
            .data(this.ingredients)
            .join("div")
        ingredient.append("div")
            .classed("product", true)
            .append(d => d.item.icon.make(32, true))
        ingredient.append("span")
            .text(d => `\u00A0${d.amount.toDecimal()} \u00d7 ${d.item.name}`)
        return node
    }
}

export const DISABLED_RECIPE_PREFIX = "D-"

/**
 * Pseudo-recipe that produces an item from nothing. The solver uses it for items whose recipes
 * are all disabled and for ignored items. It is not registered as a recipe of the item.
 */
export class DisabledRecipe implements RecipeLike {
    readonly key: string
    readonly name: string
    readonly category: null = null
    readonly ingredients: Ingredient[] = []
    readonly products: Ingredient[]
    readonly icon_col: number
    readonly icon_row: number
    readonly icon: Icon

    constructor(item: Item) {
        this.key = DISABLED_RECIPE_PREFIX + item.key
        this.name = item.name
        this.products = [new Ingredient(item, one)]
        this.icon_col = item.icon_col
        this.icon_row = item.icon_row
        this.icon = new Icon(this)
    }

    /** Returns no ingredients. The item appears from nothing. */
    getIngredients(): Ingredient[] {
        return this.ingredients
    }

    /** Returns one unit of the item. Throws for any other item. */
    gives(item: Item): Rational {
        for (const ing of this.products) {
            if (ing.item === item) {
                return ing.amount
            }
        }
        throw new Error(`recipe ${this.key} does not give ${item.key}`)
    }

    /** Returns false. Disabled items are not resources. */
    isResource(): boolean {
        return false
    }

    /** Returns true. The visualizer shows disabled items as nodes. */
    isReal(): boolean {
        return true
    }

    /** Marks this as the DisabledRecipe of an item. */
    isDisable(): boolean {
        return true
    }
}

function productIngredients(items: ReadonlyMap<string, Item>, results: readonly DatasetProduct[]): Ingredient[] {
    return results.map(({ name, amount }) => new Ingredient(requireItem(items, name), Rational.from_float_approximate(amount)))
}

function surfaceConditions(conditions: readonly SurfaceConditionData[] | undefined): SurfaceCondition[] {
    return (conditions ?? []).map(c => new SurfaceCondition(c))
}

// Creates a Recipe from a dataset entry. Returns null if an ingredient is not a known item.
function makeRecipe(items: ReadonlyMap<string, Item>, d: DatasetRecipe): Recipe | null {
    const ingredients: Ingredient[] = []
    for (const { name, amount } of d.ingredients) {
        const item = items.get(name)
        if (item === undefined) {
            return null
        }
        ingredients.push(new Ingredient(item, Rational.from_float_approximate(amount)))
    }
    return new Recipe({
        key: d.key,
        name: d.localized_name.en,
        order: d.order,
        icon_col: d.icon_col,
        icon_row: d.icon_row,
        allowProductivity: d.allow_productivity,
        // Machine selection uses one category per recipe: the first in the list.
        category: d.categories[0] ?? null,
        time: Rational.from_float_approximate(d.energy_required),
        ingredients,
        products: productIngredients(items, d.results),
        conditions: surfaceConditions(d.surface_conditions),
    })
}

const hundred = Rational.from_float(100)

/** Pseudo-recipe for an item that no recipe produces. It supplies the item at a fixed priority. */
class ResourceRecipe extends Recipe {
    constructor(item: Item, priority: number, weight: Rational) {
        super({
            key: item.key,
            name: item.name,
            order: item.order,
            icon_col: item.icon_col,
            icon_row: item.icon_row,
            allowProductivity: false,
            category: null,
            time: zero,
            ingredients: [],
            products: [new Ingredient(item, one)],
        })
        this.defaultPriority = priority
        this.defaultWeight = weight
    }

    /** Items without a recipe appear in the Resources tab. */
    override isResource(): boolean {
        return true
    }
}

/** Pseudo-recipe that turns an item into its spoil result. */
class SpoilageRecipe extends Recipe {
    constructor(fromItem: Item, toItem: Item) {
        super({
            key: `${fromItem.key}-spoilage`,
            name: `${fromItem.name} to ${toItem.name} (Spoilage)`,
            order: undefined,
            icon_col: toItem.icon_col,
            icon_row: toItem.icon_row,
            allowProductivity: false,
            category: null,
            time: zero,
            ingredients: [new Ingredient(fromItem, one)],
            products: [new Ingredient(toItem, one)],
        })
    }
}

/** Pseudo-recipe for growing a plant from its seed. Plants without surface conditions count as resources. */
class PlantRecipe extends Recipe {
    constructor(options: Omit<RecipeOptions, "allowProductivity" | "category" | "time">) {
        super({ ...options, allowProductivity: false, category: null, time: zero })
        if (this.isResource()) {
            this.defaultPriority = 1
            this.defaultWeight = hundred
        }
    }

    /** Plants without surface conditions count as resources. */
    override isResource(): boolean {
        return this.conditions.length === 0
    }
}

/** Pseudo-recipe for mining a solid resource with a mining drill. */
export class MiningRecipe extends Recipe {
    /** Mining time in seconds at mining speed 1. */
    readonly miningTime: Rational

    constructor(options: Omit<RecipeOptions, "allowProductivity" | "time">, miningTime: Rational) {
        super({ ...options, allowProductivity: true, time: zero })
        this.miningTime = miningTime
        this.defaultPriority = 1
        this.defaultWeight = hundred
    }

    /** Mined resources appear in the Resources tab. */
    override isResource(): boolean {
        return true
    }
}

/**
 * Pseudo-recipe for a fluid resource such as crude oil. It has no building, so the calculator
 * shows no pumpjack count.
 */
class PumpjackRecipe extends Recipe {
    constructor(key: string, name: string, col: number, row: number, product: Item) {
        super({
            key,
            name,
            order: undefined,
            icon_col: col,
            icon_row: row,
            allowProductivity: false,
            category: null,
            time: zero,
            ingredients: [],
            products: [new Ingredient(product, one)],
        })
        this.defaultPriority = 1
        this.defaultWeight = hundred
    }

    /** Fluid resources appear in the Resources tab. */
    override isResource(): boolean {
        return true
    }
}

/** Pseudo-recipe for pumping a fluid from a lake or ocean. */
class OffshorePumpRecipe extends Recipe {
    constructor(product: Item) {
        super({
            key: product.key,
            name: product.name,
            order: product.order,
            icon_col: product.icon_col,
            icon_row: product.icon_row,
            allowProductivity: false,
            category: "offshore-pumping",
            time: zero,
            ingredients: [],
            products: [new Ingredient(product, one)],
        })
        this.defaultPriority = 0
        this.defaultWeight = hundred
    }

    /** Pumped fluids appear in the Resources tab. */
    override isResource(): boolean {
        return true
    }
}

// Returns water used and steam produced per second by one boiler.
function getSteam(data: Dataset): [Rational, Rational] {
    const R = (x: number): Rational => Rational.from_float(x)
    const boiler = data.boilers.find(d => d.key === "boiler")
    const water = data.fluids.find(f => f.item_key === "water")
    const steam = data.fluids.find(f => f.item_key === "steam")
    if (!boiler || !water || !steam) {
        throw new Error("dataset lacks the boiler, water or steam")
    }
    const power = R(boiler.energy_consumption)
    const tempDelta = R(boiler.target_temperature).sub(R(water.default_temperature))
    // heat_capacity is in J per degree per unit.
    const waterRate = power.div(tempDelta.mul(R(water.heat_capacity)))
    const steamRate = power.div(tempDelta.mul(R(steam.heat_capacity)))
    return [waterRate, steamRate]
}

/**
 * Creates all recipes from the dataset, plus pseudo-recipes for mining, pumping, plants,
 * spoilage, the nuclear reactor and the boiler. Removes items that no recipe produces or uses.
 *
 * @param items - All items by key. Modified: unused items are deleted.
 */
export function getRecipes(data: Dataset, items: Map<string, Item>): Map<string, Recipe> {
    const recipes = new Map<string, Recipe>()
    const item = (key: string): Item => requireItem(items, key)
    const reactor = item("nuclear-reactor")
    recipes.set("nuclear-reactor-cycle", new Recipe({
        key: "nuclear-reactor-cycle",
        name: "Nuclear reactor cycle",
        order: reactor.order,
        icon_col: reactor.icon_col,
        icon_row: reactor.icon_row,
        allowProductivity: false,
        category: "nuclear",
        time: Rational.from_float(200),
        ingredients: [new Ingredient(item("uranium-fuel-cell"), one)],
        products: [
            new Ingredient(item("depleted-uranium-fuel-cell"), one),
            new Ingredient(item("nuclear-reactor-cycle"), one),
        ],
    }))
    const steam = item("steam")
    const [waterRate, steamRate] = getSteam(data)
    recipes.set("steam", new Recipe({
        key: "steam",
        name: "Steam",
        order: steam.order,
        icon_col: steam.icon_col,
        icon_row: steam.icon_row,
        allowProductivity: false,
        category: "boiler",
        time: one,
        ingredients: [new Ingredient(item("water"), waterRate)],
        products: [new Ingredient(steam, steamRate)],
    }))
    for (const d of data.recipes) {
        const r = makeRecipe(items, d)
        if (r) {
            recipes.set(d.key, r)
        }
    }
    for (const d of data.resources) {
        const first = d.results[0]
        if (d.category === "basic-fluid" && first !== undefined) {
            recipes.set(d.key, new PumpjackRecipe(d.key, d.localized_name.en, d.icon_col, d.icon_row, item(first.name)))
            continue
        }
        const ingredients: Ingredient[] = []
        if (d.required_fluid !== undefined && d.fluid_amount !== undefined) {
            ingredients.push(new Ingredient(item(d.required_fluid), Rational.from_float_approximate(d.fluid_amount / 10)))
        }
        recipes.set(d.key, new MiningRecipe({
            key: d.key,
            name: d.localized_name.en,
            order: d.order,
            icon_col: d.icon_col,
            icon_row: d.icon_row,
            category: d.category,
            ingredients,
            products: productIngredients(items, d.results),
        }, Rational.from_float_approximate(d.mining_time)))
    }
    const offshoreItems = new Set(data.planets.flatMap(p => p.resources.offshore))
    for (const key of offshoreItems) {
        if (recipes.has(key)) {
            console.warn("duplicate recipe key:", key)
        }
        recipes.set(key, new OffshorePumpRecipe(item(key)))
    }
    for (const plant of data.plants) {
        recipes.set(plant.key, new PlantRecipe({
            key: plant.key,
            name: plant.localized_name.en,
            order: plant.order,
            icon_col: plant.icon_col,
            icon_row: plant.icon_row,
            ingredients: [new Ingredient(item(plant.seed), one)],
            products: productIngredients(items, plant.results),
            conditions: surfaceConditions(plant.surface_conditions),
        }))
    }
    for (const spoil of data.spoilage) {
        const r = new SpoilageRecipe(item(spoil.from_item), item(spoil.to_item))
        recipes.set(r.key, r)
    }
    // Items that nothing produces become resources. Items that nothing produces or uses are removed.
    for (const [itemKey, it] of Array.from(items)) {
        if (it.recipes.length === 0 && it.uses.length === 0) {
            items.delete(itemKey)
        } else if (it.recipes.length === 0) {
            recipes.set(itemKey, new ResourceRecipe(it, 2, hundred))
        }
    }
    return recipes
}

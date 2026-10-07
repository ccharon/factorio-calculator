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
import { Rational, zero, one } from "../core/rational.ts"
import type { IconSource } from "./icon-source.ts"
import type { Dataset, DatasetProduct, DatasetRecipe, SurfaceConditionData } from "./dataset.ts"
import type { Item } from "./item.ts"
import type { Quality } from "./quality.ts"

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

    /** For products: the part of amount that productivity does not multiply. */
    readonly ignoredByProductivity: Rational

    constructor(item: Item, amount: Rational, ignoredByProductivity: Rational = zero) {
        this.item = item
        this.amount = amount
        this.ignoredByProductivity = ignoredByProductivity
    }

    /** Returns the produced amount per craft with the productivity multiplier prodEffect, such as 1.5 for +50%. */
    productAmount(prodEffect: Rational): Rational {
        const affected = this.amount.sub(this.ignoredByProductivity)

        if (!zero.less(affected)) {
            return this.amount
        }

        return this.amount.add(affected.mul(prodEffect.sub(one)))
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

    /** Returns whether a surface with these property values meets the condition. Throws for an unknown property. */
    holds(properties: ReadonlyMap<string, number>): boolean {
        const value = properties.get(this.property)

        if (value === undefined) {
            throw new Error(`unknown surface property: ${this.property}`)
        }

        return (this.min === undefined || value >= this.min) && (this.max === undefined || value <= this.max)
    }
}

/** What recipes need from the factory state, because fuel and productivity depend on the settings. */
export interface RecipeContext {
    /** Returns the fuel or electricity the building of recipe uses per craft, or an empty list. */
    getEnergyIngredients(recipe: Recipe): Ingredient[]

    /** Returns the productivity multiplier of recipe, such as 1.5 for +50%. */
    getProdEffect(recipe: RecipeNode): Rational
}

/** A node of the solution graph: a recipe, or the solver's output and surplus nodes. */
export interface RecipeNode {
    readonly name: string
    readonly ingredients: readonly Ingredient[]
    readonly products: readonly Ingredient[]

    /** Returns the ingredients per craft, including fuel. */
    getIngredients(context: RecipeContext): Ingredient[]

    /** Returns the amount of item produced per craft, including productivity. */
    gives(item: Item, context: RecipeContext): Rational

    /** Returns true for game recipes and false for the solver's output and surplus nodes. */
    isReal(): boolean
}

/** What the solver and the UI need from any recipe, including DisabledRecipe. */
export interface RecipeLike extends RecipeNode, IconSource {
    readonly key: string

    /** Crafting categories. Every building with one of them can craft the recipe. Empty for recipes without a building. */
    readonly categories: readonly string[]

    isResource(): boolean
    isDisable(): boolean
}

/** Returns whether node is a recipe. The solver's output nodes are the only RecipeNodes without a key. */
export function isRecipeLike(node: RecipeNode): node is RecipeLike {
    return "key" in node && "categories" in node
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
    /** Whether quality effects can raise the quality of the products. Defaults to false. */
    allowQuality?: boolean
    categories: readonly string[]

    /** Crafting time in seconds at crafting speed 1. */
    time: Rational

    ingredients: Ingredient[]
    products: Ingredient[]
    conditions?: SurfaceCondition[]

    /** Cap of the productivity bonus, such as 3 for +300%. Null for no cap. */
    maximumProductivity?: Rational | null

    /** Alt text of the icon. Defaults to the name of the first product. */
    iconName?: string

    /** For a variant: the normal recipe. */
    base?: Recipe

    /** For a variant: the quality of its solid ingredients. */
    quality?: Quality
}

/** A crafting recipe. Also the base class for pseudo-recipes such as mining and pumping. */
export class Recipe implements RecipeLike {
    readonly key: string
    readonly name: string
    readonly order: string | undefined
    readonly allow_productivity: boolean
    /** Whether quality effects can raise the quality of the products. */
    readonly allowQuality: boolean
    readonly categories: readonly string[]
    readonly time: Rational
    readonly ingredients: Ingredient[]
    readonly products: Ingredient[]
    readonly conditions: SurfaceCondition[]

    /** Cap of the productivity bonus, such as 3 for +300%, or null for no cap. */
    readonly maximumProductivity: Rational | null

    readonly icon_col: number
    readonly icon_row: number

    /** Alt text of the icon: the name of the first product unless the options set one. */
    readonly iconName: string

    /** Priority level in the Resources tab, for recipes that extract resources. */
    defaultPriority: number | undefined

    /** Weight within its priority level, for recipes that extract resources. */
    defaultWeight: Rational | undefined

    /** The normal recipe of a variant, or the recipe itself. */
    readonly base: Recipe

    /** The quality of the solid ingredients of a variant, or null for the normal recipe. */
    readonly quality: Quality | null

    /** The variants for ingredients of higher qualities. Empty for recipes without quality. */
    readonly variants: Map<Quality, Recipe> = new Map()

    constructor(options: RecipeOptions) {
        this.key = options.key
        this.name = options.name
        this.order = options.order
        this.allow_productivity = options.allowProductivity
        this.allowQuality = options.allowQuality ?? false
        this.categories = options.categories
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
        this.maximumProductivity = options.maximumProductivity ?? null
        this.icon_col = options.icon_col
        this.icon_row = options.icon_row
        this.iconName = options.iconName ?? this.products[0]?.item.name ?? options.name
        this.base = options.base ?? this
        this.quality = options.quality ?? null
    }

    /** Returns this recipe for ingredients of quality: a variant, or the normal recipe. */
    variant(quality: Quality): Recipe {
        return this.base.variants.get(quality) ?? this.base
    }

    /** Creates and registers the variant of this normal recipe for ingredients of quality. Solid items take that quality. */
    addVariant(quality: Quality): Recipe {
        const atQuality = (ing: Ingredient): Ingredient => new Ingredient(ing.item.variant(quality), ing.amount, ing.ignoredByProductivity)
        const recipe = new Recipe({
            key: `${this.key}@${quality.key}`,
            name: this.name,
            order: this.order,
            icon_col: this.icon_col,
            icon_row: this.icon_row,
            allowProductivity: this.allow_productivity,
            allowQuality: this.allowQuality,
            categories: this.categories,
            time: this.time,
            ingredients: this.ingredients.map(atQuality),
            products: this.products.map(atQuality),
            conditions: this.conditions,
            maximumProductivity: this.maximumProductivity,
            iconName: this.iconName,
            base: this,
            quality,
        })
        this.variants.set(quality, recipe)
        return recipe
    }

    /** Returns the ingredients including fuel. */
    getIngredients(context: RecipeContext): Ingredient[] {
        return this.ingredients.concat(context.getEnergyIngredients(this))
    }

    /** Returns the amount of item produced per craft, including productivity. Throws if the recipe does not produce item. */
    gives(item: Item, context: RecipeContext): Rational {
        const prodEffect = context.getProdEffect(this)
        for (const ing of this.products) {
            if (ing.item === item) {
                return ing.productAmount(prodEffect)
            }
        }
        throw new Error(`recipe ${this.key} does not give ${item.key}`)
    }

    /** Returns the amount of item used per craft including fuel, or zero. Unlike gives(), it never throws. */
    uses(item: Item, context: RecipeContext): Rational {
        for (const ing of this.getIngredients(context)) {
            if (ing.item === item) {
                return ing.amount
            }
        }
        return zero
    }

    /** Returns whether one craft produces more of item than it uses. */
    isNetProducer(item: Item, context: RecipeContext): boolean {
        return zero.less(this.gives(item, context).sub(this.uses(item, context)))
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
}

export const DISABLED_RECIPE_PREFIX = "D-"

/** Key of the abstract item for electric energy. One unit is one megajoule, so a rate in units per second is in MW. */
export const ELECTRICITY = "electricity"

/** Key of the abstract item for heat from reactors. One unit is one megajoule. */
export const HEAT = "heat"

/** Joules per unit of electricity and heat. */
export const ELECTRICITY_UNIT: Rational = Rational.from_float(1000000)

/**
 * Pseudo-recipe that produces an item from nothing. The solver uses it for items whose recipes
 * are all disabled and for ignored items. It is not registered as a recipe of the item.
 */
export class DisabledRecipe implements RecipeLike {
    readonly key: string
    readonly name: string
    readonly categories: readonly string[] = []
    readonly ingredients: Ingredient[] = []
    readonly products: Ingredient[]
    readonly icon_col: number
    readonly icon_row: number

    constructor(item: Item) {
        this.key = DISABLED_RECIPE_PREFIX + item.key
        this.name = item.name
        this.products = [new Ingredient(item, one)]
        this.icon_col = item.icon_col
        this.icon_row = item.icon_row
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
    return results.map(({ name, amount, ignored_by_productivity: ignored }) => {
        return new Ingredient(requireItem(items, name), Rational.from_float_approximate(amount), ignored ? Rational.from_float_approximate(ignored) : zero)
    })
}

/** Converts the surface conditions of a dataset entry. */
export function surfaceConditions(conditions: readonly SurfaceConditionData[] | undefined): SurfaceCondition[] {
    return (conditions ?? []).map(c => new SurfaceCondition(c))
}

// The game caps the productivity bonus of a recipe at +300% unless the recipe sets another cap.
const DEFAULT_MAXIMUM_PRODUCTIVITY = 3

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
        allowQuality: d.allow_quality,
        categories: d.categories,
        time: Rational.from_float_approximate(d.energy_required),
        ingredients,
        products: productIngredients(items, d.results),
        conditions: surfaceConditions(d.surface_conditions),
        maximumProductivity: Rational.from_float_approximate(d.maximum_productivity ?? DEFAULT_MAXIMUM_PRODUCTIVITY),
    })
}

const hundred = Rational.from_float(100)

/**
 * The nuclear reactor burning one fuel cell. Each active neighbouring reactor adds neighbourBonus times
 * the heat. The bonus enters the solver like productivity on the heat product.
 */
export class ReactorRecipe extends Recipe {
    /** Extra heat per active neighbour, such as 1 for +100%. */
    readonly neighbourBonus: Rational

    constructor(neighbourBonus: Rational, options: RecipeOptions) {
        super(options)
        this.neighbourBonus = neighbourBonus
    }
}

/** Pseudo-recipe for an item that no recipe produces. It supplies the item at a fixed priority. */
class ResourceRecipe extends Recipe {
    constructor(item: Item, priority: number | undefined, weight: Rational | undefined) {
        super({
            key: item.key,
            name: item.name,
            order: item.order,
            icon_col: item.icon_col,
            icon_row: item.icon_row,
            allowProductivity: false,
            categories: [],
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
            categories: [],
            time: zero,
            ingredients: [new Ingredient(fromItem, one)],
            products: [new Ingredient(toItem, one)],
        })
    }
}

/** Crafting category of plant recipes, which agricultural towers tend. */
export const AGRICULTURE_CATEGORY = "agriculture"

/**
 * Pseudo-recipe for growing a plant from its seed, tended by an agricultural tower. time is the
 * growth time. Plants without surface conditions count as resources.
 */
class PlantRecipe extends Recipe {
    constructor(options: Omit<RecipeOptions, "allowProductivity" | "categories">) {
        super({ ...options, allowProductivity: false, categories: [AGRICULTURE_CATEGORY] })
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
        super({ ...options, allowProductivity: true, allowQuality: true, time: zero })
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
            categories: [],
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

/**
 * Pseudo-recipe for asteroid chunks that asteroid collectors catch on a space platform. It has no
 * building, because the collection rate depends on the asteroid density along the route.
 */
class AsteroidRecipe extends Recipe {
    constructor(chunk: Item) {
        super({
            key: chunk.key,
            name: chunk.name,
            order: chunk.order,
            icon_col: chunk.icon_col,
            icon_row: chunk.icon_row,
            allowProductivity: false,
            categories: [],
            time: zero,
            ingredients: [],
            products: [new Ingredient(chunk, one)],
        })

        this.defaultPriority = 1
        this.defaultWeight = hundred
    }

    /** Asteroid chunks appear in the Resources tab. */
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
            categories: ["offshore-pumping"],
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
    const reactorDef = data.reactors.find(r => r.key === "nuclear-reactor")
    const cellValue = data.fuel.find(f => f.item_key === "uranium-fuel-cell")?.value

    if (reactorDef === undefined || cellValue === undefined) {
        throw new Error("dataset lacks the nuclear reactor or the uranium fuel cell")
    }

    recipes.set("nuclear-reactor-cycle", new ReactorRecipe(Rational.from_float_approximate(reactorDef.neighbour_bonus), {
        key: "nuclear-reactor-cycle",
        name: "Nuclear reactor cycle",
        order: reactor.order,
        icon_col: reactor.icon_col,
        icon_row: reactor.icon_row,
        allowProductivity: false,
        categories: ["nuclear"],
        // One fuel cell lasts its fuel value at the reactor's heat output.
        time: Rational.from_float(cellValue).div(Rational.from_float(reactorDef.consumption)),
        ingredients: [new Ingredient(item("uranium-fuel-cell"), one)],
        products: [
            // The neighbour bonus adds heat, not depleted cells.
            new Ingredient(item("depleted-uranium-fuel-cell"), one, one),
            new Ingredient(item(HEAT), Rational.from_float(cellValue).mul(Rational.from_float_approximate(reactorDef.energy_source.effectivity ?? 1)).div(ELECTRICITY_UNIT)),
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
        categories: ["boiler"],
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

    for (const key of new Set(data.planets.flatMap(p => p.resources.asteroid))) {
        recipes.set(key, new AsteroidRecipe(item(key)))
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
            categories: [d.category],
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
            // The dataset gives ticks.
            time: Rational.from_floats(plant.growth_ticks, 60),
        }))
    }

    for (const spoil of data.spoilage) {
        const r = new SpoilageRecipe(item(spoil.from_item), item(spoil.to_item))
        recipes.set(r.key, r)
    }

    // Electricity and heat come from outside the factory. They have no priority, so it costs nothing and does
    // not change which recipes the solver picks.
    recipes.set(ELECTRICITY, new ResourceRecipe(item(ELECTRICITY), undefined, undefined))
    recipes.set(HEAT, new ResourceRecipe(item(HEAT), undefined, undefined))

    return recipes
}

/**
 * Turns items that no recipe produces into resources and removes items that no recipe produces
 * or uses. Call it after all recipes, including pseudo-recipes, are added.
 */
export function addResources(items: Map<string, Item>, recipes: Map<string, Recipe>): void {
    for (const [itemKey, it] of Array.from(items)) {
        if (it.recipes.length === 0 && it.uses.length === 0) {
            items.delete(itemKey)
        } else if (it.recipes.length === 0) {
            recipes.set(itemKey, new ResourceRecipe(it, 2, hundred))
        }
    }
}

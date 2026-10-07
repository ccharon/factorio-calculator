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
import type { Dataset, DatasetMachine, EffectName } from "./dataset.ts"
import { HEAT_EXCHANGE_CATEGORY, powerCategory } from "./power.ts"
import type { Item } from "./item.ts"
import type { ModuleSpec } from "./module.ts"
import type { Quality, QualityContext } from "./quality.ts"
import { AGRICULTURE_CATEGORY, MiningRecipe, type Recipe, type RecipeContext, type RecipeLike, type SurfaceCondition, requireItem, surfaceConditions } from "./recipe.ts"

const thirty = Rational.from_float(30)
const sixty = Rational.from_float(60)

/** What buildings need from the factory state. FactorySpecification implements it. */
export interface BuildingContext extends RecipeContext, QualityContext {
    readonly miningProd: Rational
    readonly recipes: ReadonlyMap<string, Recipe>
    getModuleSpec(recipe: RecipeLike): ModuleSpec | undefined
    getBuilding(recipe: RecipeLike): Building | null
}

/** Constructor options of Building. */
export interface BuildingOptions {
    key: string
    name: string
    icon_col: number
    icon_row: number
    categories: readonly string[]
    speed: Rational
    prodBonus: Rational
    moduleSlots: number
    /** Working power in W. */
    power: Rational
    /** Fuel category of a burner machine, or null for electric and unpowered machines. */
    fuel: string | null
    /** Surface properties the building needs to work, such as pressure for burner machines. */
    conditions?: readonly SurfaceCondition[]
    /** Heat in W that keeps the building from freezing on planets that require heating. */
    heatingEnergy?: Rational
    /** Crafting speed by quality key. Missing qualities use speed. */
    speedByQuality?: ReadonlyMap<string, Rational>
    /** Module effects the building accepts. Undefined accepts all. */
    allowedEffects?: ReadonlySet<EffectName>
}

/** A machine that crafts recipes, such as an assembler or furnace. Base class for miners, pumps and the rocket silo. */
export class Building implements IconSource {
    readonly key: string
    readonly name: string
    readonly categories: ReadonlySet<string>
    readonly speed: Rational
    readonly prodBonus: Rational
    readonly moduleSlots: number
    readonly power: Rational
    readonly fuel: string | null
    readonly conditions: readonly SurfaceCondition[]
    /** Heat in W that keeps the building from freezing on planets that require heating. */
    readonly heatingEnergy: Rational
    private readonly speedByQuality: ReadonlyMap<string, Rational>
    private readonly allowedEffects: ReadonlySet<EffectName> | null
    readonly icon_col: number
    readonly icon_row: number

    constructor(options: BuildingOptions) {
        this.key = options.key
        this.name = options.name
        this.categories = new Set(options.categories)
        this.speed = options.speed
        this.prodBonus = options.prodBonus
        this.moduleSlots = options.moduleSlots
        this.power = options.power
        this.fuel = options.fuel
        this.conditions = options.conditions ?? []
        this.heatingEnergy = options.heatingEnergy ?? zero
        this.speedByQuality = options.speedByQuality ?? new Map()
        this.allowedEffects = options.allowedEffects ?? null
        this.icon_col = options.icon_col
        this.icon_row = options.icon_row
    }

    /** Returns whether the building has one of the crafting categories of recipe. */
    canCraft(recipe: RecipeLike): boolean {
        return recipe.categories.some(c => this.categories.has(c))
    }

    /** Returns whether the building works on a surface with these property values. */
    worksOn(properties: ReadonlyMap<string, number>): boolean {
        return this.conditions.every(c => c.holds(properties))
    }

    /** Returns whether module effects of the given kind work in this building. */
    allowsEffect(effect: EffectName): boolean {
        return this.allowedEffects === null || this.allowedEffects.has(effect)
    }

    /** Returns whether the crafting speed depends on the building's quality. */
    hasQualitySpeed(): boolean {
        return this.speedByQuality.size > 0
    }

    /** Returns the crafting speed of the building at quality. */
    speedAt(quality: Quality): Rational {
        return this.speedByQuality.get(quality.key) ?? this.speed
    }

    /** Orders buildings from slowest to fastest. Module slots break ties. */
    less(other: Building): boolean {
        if (!this.speed.equal(other.speed)) {
            return this.speed.less(other.speed)
        }
        return this.moduleSlots < other.moduleSlots
    }

    /** Returns the number of buildings needed to run recipe at rate crafts per second. */
    getCount(context: BuildingContext, recipe: Recipe, rate: Rational): Rational {
        return rate.div(this.getRecipeRate(context, recipe))
    }

    /** Returns crafts per second of one building, including module and beacon speed effects. */
    getRecipeRate(context: BuildingContext, recipe: Recipe): Rational {
        const speedEffect = context.getModuleSpec(recipe)?.speedEffect(context) ?? one
        return recipe.time.reciprocate().mul(this.speedAt(context.getQuality(recipe, "machine"))).mul(speedEffect)
    }

    /** Returns whether modules and beacons can affect this building. */
    canBeacon(): boolean {
        return this.moduleSlots > 0
    }

    /** Returns the built-in productivity bonus, such as 0.5 for the foundry. */
    prodEffect(_context: BuildingContext): Rational {
        return this.prodBonus
    }

    /** Returns the idle drain of one electric building, which is 1/30 of its working power. */
    drain(): Rational {
        return this.power.div(thirty)
    }
}

/** A building that exists only for the calculator, such as the boiler converting water. */
export class PseudoBuilding extends Building {
}

/** A mining drill. Its rate depends on mining speed and the resource's mining time. */
export class Miner extends Building {
    readonly miningSpeed: Rational

    constructor(options: Omit<BuildingOptions, "speed" | "prodBonus">, miningSpeed: Rational) {
        super({ ...options, speed: zero, prodBonus: zero })
        this.miningSpeed = miningSpeed
    }

    /** Orders drills by mining speed. */
    override less(other: Building): boolean {
        return other instanceof Miner ? this.miningSpeed.less(other.miningSpeed) : super.less(other)
    }

    /** Mining drills have no idle drain. */
    override drain(): Rational {
        return zero
    }

    /** Returns resource units mined per second by one drill. */
    override getRecipeRate(context: BuildingContext, recipe: Recipe): Rational {
        if (!(recipe instanceof MiningRecipe)) {
            throw new Error(`${this.key} cannot mine ${recipe.key}`)
        }
        const speedEffect = context.getModuleSpec(recipe)?.speedEffect(context) ?? one
        return this.miningSpeed.div(recipe.miningTime).mul(speedEffect)
    }

    /** Returns the mining productivity research bonus. */
    override prodEffect(context: BuildingContext): Rational {
        return context.miningProd
    }
}

/** An offshore pump. It uses no power and takes no modules. */
export class OffshorePump extends Building {
    /** Fluid units per second. */
    readonly pumpingSpeed: Rational

    constructor(key: string, name: string, col: number, row: number, pumpingSpeed: Rational) {
        super({
            key, name, icon_col: col, icon_row: row, categories: ["offshore-pumping"],
            speed: zero, prodBonus: zero, moduleSlots: 0, power: zero, fuel: null,
        })
        this.pumpingSpeed = pumpingSpeed
    }

    /** Orders pumps by pumping speed. */
    override less(other: Building): boolean {
        return other instanceof OffshorePump ? this.pumpingSpeed.less(other.pumpingSpeed) : super.less(other)
    }

    /** Returns fluid units pumped per second. */
    override getRecipeRate(_context: BuildingContext, _recipe: Recipe): Rational {
        return this.pumpingSpeed
    }
}

const rocketLaunchDuration = Rational.from_floats(2434, 60)

/** Rocket parts per second and launches per second of one silo. */
interface LaunchRate {
    part: Rational
    launch: Rational
}

// Returns rocket parts and launches per second of one silo. Both include the time the silo
// pauses for each launch.
function launchRate(context: BuildingContext): LaunchRate {
    const partRecipe = context.recipes.get("rocket-part")
    const partFactory = partRecipe ? context.getBuilding(partRecipe) : null
    const partItem = partRecipe?.products[0]?.item
    if (!partRecipe || !(partFactory instanceof RocketSilo) || !partItem) {
        throw new Error("rocket parts need the rocket-part recipe and a rocket silo")
    }

    const gives = partRecipe.gives(partItem, context)
    // Rocket part rate of the silo without the launch pauses.
    const rate = Building.prototype.getRecipeRate.call(partFactory, context, partRecipe)
    const perLaunch = partFactory.partsRequired.div(gives)
    const time = perLaunch.div(rate).add(rocketLaunchDuration)

    return { part: perLaunch.div(time), launch: time.reciprocate() }
}

/** The rocket silo building rocket parts. Its rate includes the pause for each launch. */
class RocketSilo extends Building {
    readonly partsRequired: Rational

    constructor(options: BuildingOptions, partsRequired: Rational) {
        super(options)
        this.partsRequired = partsRequired
    }

    /** Returns rocket parts per second. */
    override getRecipeRate(context: BuildingContext, _recipe: Recipe): Rational {
        return launchRate(context).part
    }
}

/** An agricultural tower. It harvests each of its plots once per growth time of the plant. */
class AgriculturalTower extends Building {
    /** Number of plants one tower tends. */
    readonly plots: Rational

    constructor(options: Omit<BuildingOptions, "speed" | "prodBonus" | "categories">, plots: number) {
        super({ ...options, categories: [AGRICULTURE_CATEGORY], speed: one, prodBonus: zero })
        this.plots = Rational.from_float(plots)
    }

    /** Returns harvests per second of one tower. */
    override getRecipeRate(_context: BuildingContext, recipe: Recipe): Rational {
        return this.plots.div(recipe.time)
    }
}

function qualitySpeeds(speeds: Record<string, number> | undefined): Map<string, Rational> {
    return new Map(Object.entries(speeds ?? {}).map(([q, s]) => [q, Rational.from_float_approximate(s)]))
}

function iconOptions(d: { key: string, localized_name: { en: string }, icon_col: number, icon_row: number }): Pick<BuildingOptions, "key" | "name" | "icon_col" | "icon_row"> {
    return { key: d.key, name: d.localized_name.en, icon_col: d.icon_col, icon_row: d.icon_row }
}

function fuelCategory(d: DatasetMachine): string | null {
    return d.energy_source?.type === "burner" ? d.energy_source.fuel_category ?? "chemical" : null
}

function machineOptions(d: DatasetMachine): Pick<BuildingOptions, "key" | "name" | "icon_col" | "icon_row" | "moduleSlots" | "power" | "fuel" | "conditions" | "heatingEnergy" | "allowedEffects"> {
    return {
        key: d.key,
        name: d.localized_name.en,
        icon_col: d.icon_col,
        icon_row: d.icon_row,
        moduleSlots: d.module_slots,
        power: Rational.from_float_approximate(d.energy_usage ?? 0),
        fuel: fuelCategory(d),
        conditions: surfaceConditions(d.surface_conditions),
        heatingEnergy: Rational.from_float_approximate(d.heating_energy ?? 0),
        allowedEffects: d.allowed_effects === undefined ? undefined : new Set(d.allowed_effects),
    }
}

/** Creates all buildings from the dataset, plus pseudo-buildings for the nuclear reactor and the boiler. */
export function getBuildings(data: Dataset, items: ReadonlyMap<string, Item>): Building[] {
    const buildings: Building[] = []
    const reactor = requireItem(items, "nuclear-reactor")
    buildings.push(new PseudoBuilding({
        key: "nuclear-reactor", name: reactor.name, icon_col: reactor.icon_col, icon_row: reactor.icon_row,
        categories: ["nuclear"], speed: one, prodBonus: zero, moduleSlots: 0, power: zero, fuel: null,
    }))

    const boilerItem = requireItem(items, "boiler")
    const boilerDef = data.boilers.find(d => d.key === "boiler")
    if (boilerDef === undefined) {
        throw new Error("dataset lacks the boiler")
    }
    buildings.push(new PseudoBuilding({
        key: "boiler", name: boilerItem.name, icon_col: boilerItem.icon_col, icon_row: boilerItem.icon_row,
        categories: ["boiler"], speed: one, prodBonus: zero, moduleSlots: 0,
        power: Rational.from_float(boilerDef.energy_consumption), fuel: "chemical",
    }))

    for (const d of data.crafting_machines) {
        buildings.push(new Building({
            ...machineOptions(d),
            categories: d.crafting_categories,
            speed: Rational.from_float_approximate(d.crafting_speed),
            speedByQuality: qualitySpeeds(d.crafting_speed_by_quality),
            prodBonus: d.prod_bonus ? Rational.from_float_approximate(d.prod_bonus) : zero,
        }))
    }

    for (const d of data.generators) {
        buildings.push(new PseudoBuilding({ ...iconOptions(d), categories: [powerCategory(d.key)], speed: one, prodBonus: zero, moduleSlots: 0, power: zero, fuel: null }))
    }
    for (const d of data.fusion_generators) {
        buildings.push(new PseudoBuilding({ ...iconOptions(d), categories: [powerCategory(d.key)], speed: one, prodBonus: zero, moduleSlots: 0, power: zero, fuel: null }))
    }
    for (const d of data.fusion_reactors) {
        buildings.push(new Building({
            ...iconOptions(d), categories: [powerCategory(d.key)], speed: one, prodBonus: zero, moduleSlots: 0,
            power: Rational.from_float(d.power_input), fuel: null,
        }))
    }
    for (const d of data.solar_panels) {
        buildings.push(new PseudoBuilding({ ...iconOptions(d), categories: [powerCategory(d.key)], speed: one, prodBonus: zero, moduleSlots: 0, power: zero, fuel: null }))
    }
    // Reactors other than the nuclear reactor, such as the heating tower, burn fuel into heat.
    for (const d of data.reactors.filter(r => r.key !== "nuclear-reactor")) {
        const fuel = d.energy_source.fuel_categories?.[0] ?? d.energy_source.fuel_category ?? null
        buildings.push(new Building({
            ...iconOptions(d), categories: [powerCategory(d.key)], speed: one, prodBonus: zero, moduleSlots: 0,
            power: Rational.from_float(d.consumption), fuel,
        }))
    }
    for (const d of data.boilers.filter(b => b.energy_source.type === "heat")) {
        buildings.push(new PseudoBuilding({ ...iconOptions(d), categories: [HEAT_EXCHANGE_CATEGORY], speed: one, prodBonus: zero, moduleSlots: 0, power: zero, fuel: null }))
    }

    for (const d of data.agricultural_tower) {
        buildings.push(new AgriculturalTower(machineOptions(d), d.plots))
    }

    for (const d of data.rocket_silo) {
        buildings.push(new RocketSilo({
            ...machineOptions(d),
            categories: d.crafting_categories,
            speed: Rational.from_float_approximate(d.crafting_speed),
            speedByQuality: qualitySpeeds(d.crafting_speed_by_quality),
            prodBonus: zero,
            fuel: null,
        }, Rational.from_float(d.rocket_parts_required)))
    }

    for (const d of data.offshore_pumps) {
        // The dataset gives units per tick.
        const speed = Rational.from_float_approximate(d.pumping_speed).mul(sixty)
        buildings.push(new OffshorePump(d.key, d.localized_name.en, d.icon_col, d.icon_row, speed))
    }

    for (const d of data.mining_drills) {
        // Fluid resources have no building.
        if (d.key === "pumpjack") {
            continue
        }
        buildings.push(new Miner({ ...machineOptions(d), categories: d.resource_categories }, Rational.from_float_approximate(d.mining_speed)))
    }

    return buildings
}

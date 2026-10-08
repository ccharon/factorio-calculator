// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import { Rational, zero, one, two } from "../core/rational.ts"
import type { IconSource } from "./icon-source.ts"
import type { Dataset, DatasetLaunch, DatasetMachine, EffectName, NamedPrototype } from "./dataset.ts"
import { burnerFuelCategory } from "./fuel.ts"
import { BOILER, DEFAULT_FUEL_CATEGORY, NUCLEAR_REACTOR, PUMPJACK, ROCKET_PART, TICKS_PER_SECOND } from "./game.ts"
import { HEAT_EXCHANGE_CATEGORY, powerCategory } from "./power.ts"
import type { Item } from "./item.ts"
import type { ModuleSpec } from "./module.ts"
import type { Quality, QualityContext } from "./quality.ts"
import {
    AGRICULTURE_CATEGORY, BOILER_CATEGORY, MiningRecipe, NUCLEAR_CATEGORY, OFFSHORE_PUMPING_CATEGORY, type Recipe, type RecipeContext, type RecipeLike, type SurfaceCondition,
    requireItem, surfaceConditions,
} from "./recipe.ts"

// Electric buildings draw this share of their working power while idle.
const idleDrainShare = Rational.from_floats(1, 30)

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
        return this.power.mul(idleDrainShare)
    }

    /** Returns the power in W of one building that crafts crafts per second, before module effects. */
    workingPower(_crafts: Rational): Rational {
        return this.power
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
        super({ ...fixedOptions({ key, name, icon_col: col, icon_row: row }, OFFSHORE_PUMPING_CATEGORY), speed: zero })
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

/** Ticks of the launch sequence of a rocket silo at one quality, as in DatasetLaunch. */
interface LaunchTicks {
    readonly flight: Rational
    readonly quick: Rational
    readonly lights: Rational
    readonly reopen: readonly (readonly [Rational, Rational])[]
    readonly doors: Rational
    readonly full: Rational
}

function launchTicks(d: DatasetLaunch): LaunchTicks {
    const ticks = (n: number): Rational => Rational.from_float(n)
    return {
        flight: ticks(d.flight), quick: ticks(d.quick), lights: ticks(d.lights), doors: ticks(d.doors), full: ticks(d.full),
        reopen: d.reopen.map(([first, last]) => [ticks(first), ticks(last)] as const),
    }
}

/** One launch: ticks since the previous launch, and ticks between the rocket appearing and its launch. */
interface Launch {
    readonly cycle: Rational
    readonly appeared: Rational
}

// Returns the launch after one whose rocket appeared appeared ticks before it. The parts for the next
// rocket take partTicks from that moment. Ready during the flight, the next rocket rises in the open
// silo. Ready while the lights blink, it waits for the next reopen range. Otherwise the doors close
// and the rocket is created when both doors and parts are done.
function nextLaunch(t: LaunchTicks, partTicks: Rational, appeared: Rational): Launch {
    const ready = partTicks.sub(appeared)
    if (!t.flight.less(ready)) {
        return { cycle: t.flight.add(t.quick), appeared: t.quick }
    }

    const blink = ready.sub(t.flight).ceil()
    for (const [first, last] of t.reopen) {
        if (!last.less(blink)) {
            const opened = blink.less(first) ? first : blink
            return { cycle: t.flight.add(opened).add(one).add(t.quick), appeared: t.quick }
        }
    }

    const closed = t.flight.add(t.lights).add(t.doors)
    const created = closed.less(ready) ? ready : closed
    return { cycle: created.add(t.full), appeared: t.full }
}

// Returns the average ticks between two launches of a silo that needs partTicks for the parts of one
// rocket. The launches settle into a repeating pattern of at most two different launches.
function launchCycle(t: LaunchTicks, partTicks: Rational): Rational {
    const afterFull = nextLaunch(t, partTicks, t.full)
    if (afterFull.appeared.equal(t.full)) {
        return afterFull.cycle
    }
    const afterQuick = nextLaunch(t, partTicks, t.quick)
    if (afterQuick.appeared.equal(t.quick)) {
        return afterQuick.cycle
    }
    return afterFull.cycle.add(afterQuick.cycle).div(two)
}

// Returns rocket parts per second of one silo, including the time the launches take.
function launchRate(context: BuildingContext): Rational {
    const partRecipe = context.recipes.get(ROCKET_PART)
    const partFactory = partRecipe ? context.getBuilding(partRecipe) : null
    const partItem = partRecipe?.products[0]?.item
    if (!partRecipe || !(partFactory instanceof RocketSilo) || !partItem) {
        throw new Error("rocket parts need the rocket-part recipe and a rocket silo")
    }

    const quality = context.getQuality(partRecipe, "machine")
    const ticks = partFactory.launches.get(quality.key)
    if (ticks === undefined) {
        throw new Error(`${partFactory.key} has no launch times for quality ${quality.key}`)
    }

    // Rocket part crafts per second of the silo without the launches.
    const rate = Building.prototype.getRecipeRate.call(partFactory, context, partRecipe)
    const perLaunch = partFactory.partsRequired.div(partRecipe.gives(partItem, context))
    const partTicks = perLaunch.div(rate).mul(Rational.from_integer(TICKS_PER_SECOND))
    const cycle = launchCycle(ticks, partTicks).div(Rational.from_integer(TICKS_PER_SECOND))

    return perLaunch.div(cycle)
}

/** The rocket silo building rocket parts. Its rate includes the time the launches take. */
class RocketSilo extends Building {
    readonly partsRequired: Rational
    /** Launch sequence by quality key. */
    readonly launches: ReadonlyMap<string, LaunchTicks>

    constructor(options: BuildingOptions, partsRequired: Rational, launches: ReadonlyMap<string, LaunchTicks>) {
        super(options)
        this.partsRequired = partsRequired
        this.launches = launches
    }

    /** Returns rocket parts per second. */
    override getRecipeRate(context: BuildingContext, _recipe: Recipe): Rational {
        return launchRate(context)
    }
}

/** A fusion reactor. It draws its full power input while it works and has no idle drain. */
class FusionReactor extends Building {
    /** Fusion reactors have no idle drain. */
    override drain(): Rational {
        return zero
    }
}

/**
 * An agricultural tower. It harvests each of its plots once per growth time of the plant, and uses
 * power only while its crane plants and harvests.
 */
class AgriculturalTower extends Building {
    /** Number of plants one tower tends. */
    readonly plots: Rational
    /** Electric energy in J for one harvest and the replanting. */
    readonly harvestEnergy: Rational

    constructor(options: Omit<BuildingOptions, "speed" | "prodBonus" | "categories">, plots: number, harvestEnergy: number) {
        super({ ...options, categories: [AGRICULTURE_CATEGORY], speed: one, prodBonus: zero })
        this.plots = Rational.from_float(plots)
        this.harvestEnergy = Rational.from_float(harvestEnergy)
    }

    /** Agricultural towers have no idle drain. */
    override drain(): Rational {
        return zero
    }

    /** Returns the crane power for crafts harvests per second. */
    override workingPower(crafts: Rational): Rational {
        return this.harvestEnergy.mul(crafts)
    }

    /** Returns harvests per second of one tower. */
    override getRecipeRate(_context: BuildingContext, recipe: Recipe): Rational {
        return this.plots.div(recipe.time)
    }
}

function qualitySpeeds(speeds: Record<string, number> | undefined): Map<string, Rational> {
    return new Map(Object.entries(speeds ?? {}).map(([q, s]) => [q, Rational.from_float_approximate(s)]))
}

type IconOptions = Pick<BuildingOptions, "key" | "name" | "icon_col" | "icon_row">

function iconOptions(d: NamedPrototype): IconOptions {
    return { key: d.key, name: d.localized_name.en, icon_col: d.icon_col, icon_row: d.icon_row }
}

// Options of a building with one category, crafting speed 1, no modules and no power of its own,
// such as a generator. Callers override what differs.
function fixedOptions(icon: IconOptions, category: string): BuildingOptions {
    return { ...icon, categories: [category], speed: one, prodBonus: zero, moduleSlots: 0, power: zero, fuel: null }
}

function machineOptions(d: DatasetMachine): Pick<BuildingOptions, "key" | "name" | "icon_col" | "icon_row" | "moduleSlots" | "power" | "fuel" | "conditions" | "heatingEnergy" | "allowedEffects"> {
    return {
        ...iconOptions(d),
        moduleSlots: d.module_slots,
        power: Rational.from_float_approximate(d.energy_usage ?? 0),
        fuel: burnerFuelCategory(d.energy_source),
        conditions: surfaceConditions(d.surface_conditions),
        heatingEnergy: Rational.from_float_approximate(d.heating_energy ?? 0),
        allowedEffects: d.allowed_effects === undefined ? undefined : new Set(d.allowed_effects),
    }
}

/** Creates all buildings from the dataset, plus pseudo-buildings for the nuclear reactor and the boiler. */
export function getBuildings(data: Dataset, items: ReadonlyMap<string, Item>): Building[] {
    const buildings: Building[] = []
    const itemOptions = (key: string): IconOptions => {
        const item = requireItem(items, key)
        return { key, name: item.name, icon_col: item.icon_col, icon_row: item.icon_row }
    }
    buildings.push(new PseudoBuilding(fixedOptions(itemOptions(NUCLEAR_REACTOR), NUCLEAR_CATEGORY)))

    const boilerDef = data.boilers.find(d => d.key === BOILER)
    if (boilerDef === undefined) {
        throw new Error("dataset lacks the boiler")
    }
    buildings.push(new PseudoBuilding({
        ...fixedOptions(itemOptions(BOILER), BOILER_CATEGORY),
        power: Rational.from_float(boilerDef.energy_consumption),
        fuel: DEFAULT_FUEL_CATEGORY,
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

    const powerOptions = (d: NamedPrototype): BuildingOptions => fixedOptions(iconOptions(d), powerCategory(d.key))
    for (const d of [...data.generators, ...data.fusion_generators, ...data.solar_panels]) {
        buildings.push(new PseudoBuilding(powerOptions(d)))
    }
    for (const d of data.fusion_reactors) {
        buildings.push(new FusionReactor({ ...powerOptions(d), power: Rational.from_float(d.power_input) }))
    }
    // Reactors other than the nuclear reactor, such as the heating tower, burn fuel into heat.
    for (const d of data.reactors.filter(r => r.key !== NUCLEAR_REACTOR)) {
        buildings.push(new Building({ ...powerOptions(d), power: Rational.from_float(d.consumption), fuel: burnerFuelCategory(d.energy_source) }))
    }
    for (const d of data.boilers.filter(b => b.energy_source.type === "heat")) {
        buildings.push(new PseudoBuilding(fixedOptions(iconOptions(d), HEAT_EXCHANGE_CATEGORY)))
    }

    for (const d of data.agricultural_tower) {
        buildings.push(new AgriculturalTower(machineOptions(d), d.plots, d.harvest_energy))
    }

    for (const d of data.rocket_silo) {
        buildings.push(new RocketSilo({
            ...machineOptions(d),
            categories: d.crafting_categories,
            speed: Rational.from_float_approximate(d.crafting_speed),
            speedByQuality: qualitySpeeds(d.crafting_speed_by_quality),
            prodBonus: zero,
            fuel: null,
        }, Rational.from_float(d.rocket_parts_required), new Map(Object.entries(d.launch_by_quality).map(([q, l]) => [q, launchTicks(l)]))))
    }

    for (const d of data.offshore_pumps) {
        // The dataset gives units per tick.
        const speed = Rational.from_float_approximate(d.pumping_speed).mul(Rational.from_integer(TICKS_PER_SECOND))
        buildings.push(new OffshorePump(d.key, d.localized_name.en, d.icon_col, d.icon_row, speed))
    }

    for (const d of data.mining_drills) {
        // Fluid resources have no building.
        if (d.key === PUMPJACK) {
            continue
        }
        buildings.push(new Miner({ ...machineOptions(d), categories: d.resource_categories }, Rational.from_float_approximate(d.mining_speed)))
    }

    return buildings
}

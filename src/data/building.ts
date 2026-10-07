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
import { powerRepr } from "../ui/energy.ts"
import { Icon, type IconSource } from "../ui/icon.ts"
import type { Dataset, DatasetMachine } from "./dataset.ts"
import type { Item } from "./item.ts"
import type { ModuleSpec } from "./module.ts"
import { MiningRecipe, type Recipe, type RecipeLike, requireItem } from "./recipe.ts"

const thirty = Rational.from_float(30)
const sixty = Rational.from_float(60)

/** What buildings need from the factory state. FactorySpecification implements it. */
export interface BuildingContext {
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
}

function header(obj: IconSource & { icon: Icon }): d3.Selection<HTMLDivElement, undefined, null, undefined> {
    const t = d3.create("div").classed("frame", true)
    const h = t.append("h3")
    h.append(() => obj.icon.make(32, true))
    h.node()?.append(obj.name)
    return t
}

function addLine(t: d3.Selection<HTMLDivElement, undefined, null, undefined>, label: string, value: string): void {
    const line = t.append("div")
    line.append("b").text(label)
    line.append("span").text(value)
}

function formatPower(power: Rational): string {
    const { power: value, suffix } = powerRepr(power)
    return `${value.toDecimal(0)} ${suffix}`
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
    readonly icon_col: number
    readonly icon_row: number
    readonly icon: Icon

    constructor(options: BuildingOptions) {
        this.key = options.key
        this.name = options.name
        this.categories = new Set(options.categories)
        this.speed = options.speed
        this.prodBonus = options.prodBonus
        this.moduleSlots = options.moduleSlots
        this.power = options.power
        this.fuel = options.fuel
        this.icon_col = options.icon_col
        this.icon_row = options.icon_row
        this.icon = new Icon(this)
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
        const speedEffect = context.getModuleSpec(recipe)?.speedEffect() ?? one
        return recipe.time.reciprocate().mul(this.speed).mul(speedEffect)
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

    /** Returns a tooltip element with power, crafting speed and module slots. */
    renderTooltip(): HTMLDivElement {
        const t = header(this)
        addLine(t, "Energy consumption: ", formatPower(this.power))
        addLine(t, "Crafting speed: ", this.speed.toDecimal())
        addLine(t, "Module slots: ", String(this.moduleSlots))
        return t.node() as HTMLDivElement
    }
}

/** A building that exists only for the calculator, such as the boiler converting water. Its tooltip shows only the name. */
class PseudoBuilding extends Building {
    /** Returns a tooltip element with the name only. */
    override renderTooltip(): HTMLDivElement {
        return header(this).node() as HTMLDivElement
    }
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
        const speedEffect = context.getModuleSpec(recipe)?.speedEffect() ?? one
        return this.miningSpeed.div(recipe.miningTime).mul(speedEffect)
    }

    /** Returns the mining productivity research bonus. */
    override prodEffect(context: BuildingContext): Rational {
        return context.miningProd
    }

    /** Returns a tooltip element with power, mining speed and module slots. */
    override renderTooltip(): HTMLDivElement {
        const t = header(this)
        addLine(t, "Energy consumption: ", formatPower(this.power))
        addLine(t, "Mining speed: ", this.miningSpeed.toDecimal())
        addLine(t, "Module slots: ", String(this.moduleSlots))
        return t.node() as HTMLDivElement
    }
}

/** An offshore pump. It uses no power and takes no modules. */
class OffshorePump extends Building {
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

    /** Returns a tooltip element with the pumping speed. */
    override renderTooltip(): HTMLDivElement {
        const t = header(this)
        addLine(t, "Pumping speed: ", `${spec.format.rate(this.pumpingSpeed)}/${spec.format.rateName}`)
        return t.node() as HTMLDivElement
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
    const gives = partRecipe.gives(partItem)
    // Rocket part rate of the silo without the launch pauses.
    const rate = Building.prototype.getRecipeRate.call(partFactory, context, partRecipe)
    const perLaunch = partFactory.partsRequired.div(gives)
    const time = perLaunch.div(rate).add(rocketLaunchDuration)
    return { part: perLaunch.div(time), launch: time.reciprocate() }
}

/** The rocket silo building rocket parts. Its rate includes the pause for each launch. */
export class RocketSilo extends Building {
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

function fuelCategory(d: DatasetMachine): string | null {
    return d.energy_source?.type === "burner" ? d.energy_source.fuel_category ?? "chemical" : null
}

function machineOptions(d: DatasetMachine): Pick<BuildingOptions, "key" | "name" | "icon_col" | "icon_row" | "moduleSlots" | "power" | "fuel"> {
    return {
        key: d.key,
        name: d.localized_name.en,
        icon_col: d.icon_col,
        icon_row: d.icon_row,
        moduleSlots: d.module_slots,
        power: Rational.from_float_approximate(d.energy_usage ?? 0),
        fuel: fuelCategory(d),
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
            prodBonus: d.prod_bonus ? Rational.from_float_approximate(d.prod_bonus) : zero,
        }))
    }
    for (const d of data.rocket_silo) {
        buildings.push(new RocketSilo({
            ...machineOptions(d),
            categories: d.crafting_categories,
            speed: Rational.from_float_approximate(d.crafting_speed),
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

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
import { type Output, type SolverDebug, solve } from "../core/solve.ts"
import type { Totals } from "../core/totals.ts"
import type { Belt } from "../data/belt.ts"
import type { Building, BuildingContext } from "../data/building.ts"
import type { Fuel } from "../data/fuel.ts"
import type { ItemGroups } from "../data/group.ts"
import type { Item } from "../data/item.ts"
import { type Module, type ModuleDefaults, ModuleSpec } from "../data/module.ts"
import type { Planet } from "../data/planet.ts"
import { DISABLED_RECIPE_PREFIX, Recipe, type RecipeLike, type RecipeNode, isRecipeLike } from "../data/recipe.ts"
import { renderDebug } from "../ui/debug.ts"
import { displayItems } from "../ui/display.ts"
import { currentTab } from "../ui/events.ts"
import { BuildTarget } from "../ui/target.ts"
import { reapTooltips } from "../ui/tooltip.ts"
import { renderTotals } from "../visualize/visualize.ts"
import { Formatter } from "./align.ts"
import { formatSettings } from "./fragment.ts"
import { PriorityList, type PriorityLevelMap } from "./priority.ts"
import { encodeSettings } from "./url-codec.ts"

const DEFAULT_ITEM_KEY = "advanced-circuit"

export const DEFAULT_PLANET = "nauvis"
export const DEFAULT_BELT = "transport-belt"
export const DEFAULT_FUEL = "coal"
const DEFAULT_BUILDINGS = new Set([
    "assembling-machine-1",
    "electric-furnace",
    "electric-mining-drill",
])

const hundred = Rational.from_float(100)
const ten = Rational.from_float(10)

// Buildings whose crafting categories overlap, collected while grouping.
class BuildingSet {
    readonly categories: Set<string>
    readonly buildings: Set<Building>

    constructor(building: Building) {
        this.categories = new Set(building.categories)
        this.buildings = new Set([building])
    }

    merge(other: BuildingSet): void {
        other.categories.forEach(c => this.categories.add(c))
        other.buildings.forEach(b => this.buildings.add(b))
    }

    overlap(other: BuildingSet): boolean {
        return Array.from(this.categories).some(c => other.categories.has(c))
    }
}

/** Sorts buildings in place from slowest to fastest. */
export function buildingSort(buildings: Building[]): void {
    buildings.sort((a, b) => (a.less(b) ? -1 : b.less(a) ? 1 : 0))
}

/** Buildings that can replace each other, such as the three assemblers. The user picks the minimum building per group. */
export class BuildingGroup {
    /** From slowest to fastest. */
    readonly buildings: Building[]
    /** The selected minimum building. */
    building: Building

    constructor(buildings: Iterable<Building>) {
        this.buildings = Array.from(buildings)
        buildingSort(this.buildings)
        this.building = this.getDefault()
    }

    /** Returns the default minimum building: one of DEFAULT_BUILDINGS, or the fastest. */
    getDefault(): Building {
        const building = this.buildings.find(b => DEFAULT_BUILDINGS.has(b.key)) ?? this.buildings[this.buildings.length - 1]
        if (building === undefined) {
            throw new Error("empty building group")
        }
        return building
    }

    /**
     * Returns the building for recipe: the selected minimum building if it can craft the recipe,
     * otherwise the next faster one that can, otherwise the fastest one that can.
     */
    getBuilding(recipe: RecipeLike): Building | null {
        let b: Building | null = null
        for (const building of this.buildings) {
            if (recipe.category !== null && building.categories.has(recipe.category)) {
                b = building
                if (building === this.building || this.building.less(building)) {
                    return building
                }
            }
        }
        return b
    }
}

// Groups buildings with overlapping categories and returns the group of each category.
function getBuildingGroups(buildings: readonly Building[]): Map<string, BuildingGroup> {
    const sets = new Set<BuildingSet>()
    for (const building of buildings) {
        const set = new BuildingSet(building)
        for (const s of Array.from(sets)) {
            if (set.overlap(s)) {
                set.merge(s)
                sets.delete(s)
            }
        }
        sets.add(set)
    }
    const groups = new Map<string, BuildingGroup>()
    for (const { categories, buildings: members } of sets) {
        const group = new BuildingGroup(members)
        for (const category of categories) {
            groups.set(category, group)
        }
    }
    return groups
}

/** Power use of a recipe: the fuel category of burner buildings, "electric", or null without building. */
export interface PowerUsage {
    fuel: string | null
    /** W, or for burner buildings J/s of fuel. */
    power: Rational
}

/** Recipes disabled and enabled relative to the planet selection, as stored in the URL. */
export interface NetDisable {
    disable: ReadonlySet<Recipe>
    enable: ReadonlySet<Recipe>
}

function required<T>(value: T | null, name: string): T {
    if (value === null) {
        throw new Error(`${name} is not set before the dataset is loaded`)
    }
    return value
}

/**
 * The calculator state: game data, settings, build targets and the last solution. One instance
 * exists as spec. It implements the context interfaces of the solver and the data classes.
 */
export class FactorySpecification implements BuildingContext, ModuleDefaults {
    items: Map<string, Item> = new Map()
    recipes: Map<string, Recipe> = new Map()
    modules: Map<string, Module> = new Map()
    planets: Map<string, Planet> = new Map()
    /** Building group of each crafting category. */
    buildings: Map<string, BuildingGroup> = new Map()
    buildingKeys: Map<string, Building> = new Map()
    belts: Map<string, Belt> = new Map()
    fuels: Map<string, Fuel> = new Map()
    itemGroups: ItemGroups = []

    buildTargets: BuildTarget[] = []

    /** Module settings by recipe. */
    readonly spec: Map<Recipe, ModuleSpec> = new Map()
    defaultModule: Module | null = null
    secondaryDefaultModule: Module | null = null
    readonly defaultBeacon: [Module | null, Module | null] = [null, null]
    defaultBeaconCount: Rational = zero

    miningProd: Rational = zero

    readonly ignore: Set<Item> = new Set()
    readonly disable: Set<Recipe> = new Set()
    readonly selectedPlanets: Set<Planet> = new Set()
    /** Recipes the selected planets disable, or null before a planet is selected. */
    planetaryBaseline: Set<Recipe> | null = null

    defaultPriority: PriorityLevelMap[] = []

    readonly format: Formatter = new Formatter()

    lastTotals: Totals | null = null
    lastPartial: SolverDebug["partial"] | null = null
    lastTableau: SolverDebug["tableau"] = null
    lastMetadata: SolverDebug["metadata"] = null
    lastSolution: SolverDebug["solution"] = null

    debug = false

    private beltValue: Belt | null = null
    private fuelValue: Fuel | null = null
    private priorityValue: PriorityList | null = null
    // Counts hash updates, so that a slow compression cannot overwrite a newer hash.
    private hashVersion = 0

    /** The belt used for belt counts. */
    get belt(): Belt {
        return required(this.beltValue, "belt")
    }

    set belt(belt: Belt) {
        this.beltValue = belt
    }

    /** The fuel burned by chemical burner buildings. */
    get fuel(): Fuel {
        return required(this.fuelValue, "fuel")
    }

    set fuel(fuel: Fuel) {
        this.fuelValue = fuel
    }

    /** Resource priority levels, most preferred first. */
    get priority(): PriorityList {
        return required(this.priorityValue, "priority")
    }

    /** Stores the game data of a loaded dataset and resets the defaults that depend on it. */
    setData(
        items: Map<string, Item>,
        recipes: Map<string, Recipe>,
        planets: Map<string, Planet>,
        modules: Map<string, Module>,
        buildings: readonly Building[],
        belts: Map<string, Belt>,
        fuels: Map<string, Fuel>,
        itemGroups: ItemGroups,
    ): void {
        this.items = items
        this.recipes = recipes
        this.planets = planets
        this.modules = modules

        this.buildings = getBuildingGroups(buildings)
        this.buildingKeys = new Map(buildings.map(b => [b.key, b]))

        this.belts = belts
        this.beltValue = belts.get(DEFAULT_BELT) ?? null
        this.fuels = fuels
        this.fuelValue = fuels.get(DEFAULT_FUEL) ?? null

        this.miningProd = zero
        this.itemGroups = itemGroups
        this.defaultPriority = this.getDefaultPriorityArray()
        this.priorityValue = null
    }

    /** Enables all recipes. */
    setDefaultDisable(): void {
        this.disable.clear()
    }

    // Puts the item's DisabledRecipe into the least preferred level, unless it is already listed
    // because the item is ignored.
    private addItemToMaxPriority(item: Item): void {
        if (this.priority.getResource(item.disableRecipe) !== null) {
            return
        }
        let level = this.priority.getLastLevel()
        if (level === null || !Array.from(level).some(r => r.recipe.isDisable())) {
            level = this.priority.addPriorityBefore(null)
        }
        this.priority.addRecipe(item.disableRecipe, hundred, level)
    }

    // Shows the recipe choice again on targets whose item is among items.
    private redisplayTargets(items: ReadonlySet<Item>): void {
        for (const target of this.buildTargets) {
            if (items.has(target.item)) {
                target.displayRecipes()
            }
        }
    }

    /** Disables recipe. Items left without a net producer get their DisabledRecipe as a resource. */
    setDisable(recipe: Recipe): void {
        if (this.disable.has(recipe)) {
            return
        }

        const candidates = new Set<Item>()
        const items = new Set<Item>()
        for (const { item } of recipe.products) {
            items.add(item)
            if (!this.isItemDisabled(item) && !this.ignore.has(item)) {
                candidates.add(item)
            }
        }

        this.disable.add(recipe)
        for (const item of candidates) {
            if (this.isItemDisabled(item)) {
                this.addItemToMaxPriority(item)
            }
        }

        this.redisplayTargets(items)
    }

    /**
     * Enables recipe. An item's DisabledRecipe leaves the priority list once the item has a net
     * producer again and is not ignored.
     */
    setEnable(recipe: Recipe): void {
        if (!this.disable.has(recipe)) {
            return
        }

        const candidates = new Set<Item>()
        const items = new Set<Item>()
        for (const { item } of recipe.products) {
            items.add(item)
            if (this.isItemDisabled(item) && !this.ignore.has(item)) {
                candidates.add(item)
            }
        }

        this.disable.delete(recipe)
        for (const item of candidates) {
            if (!this.isItemDisabled(item)) {
                this.priority.removeRecipe(item.disableRecipe)
            }
        }

        this.redisplayTargets(items)
    }

    // Disables exactly the recipes that all selected planets disable.
    private syncPlanetDisable(): void {
        let allDisable = new Set<Recipe>()
        const planets = Array.from(this.selectedPlanets)
        const first = planets[0]
        if (first !== undefined) {
            allDisable = new Set(first.disable)
            for (const p of planets.slice(1)) {
                allDisable = new Set(Array.from(p.disable).filter(r => allDisable.has(r)))
            }
        }

        this.planetaryBaseline = allDisable
        for (const r of Array.from(this.disable).filter(r => !allDisable.has(r))) {
            this.setEnable(r)
        }
        for (const r of allDisable) {
            if (!this.disable.has(r)) {
                this.setDisable(r)
            }
        }
    }

    /** Returns whether only the default planet is selected. */
    isDefaultPlanet(): boolean {
        if (this.planets.size <= 1) {
            return true
        }
        const selected = Array.from(this.selectedPlanets)
        return selected.length === 1 && selected[0]?.key === DEFAULT_PLANET
    }

    /** Returns the recipes disabled and enabled beyond what the planet selection implies. */
    getNetDisable(): NetDisable {
        const baseline = this.planetaryBaseline
        if (baseline === null) {
            return { disable: this.disable, enable: new Set() }
        }
        return {
            disable: new Set(Array.from(this.disable).filter(r => !baseline.has(r))),
            enable: new Set(Array.from(baseline).filter(r => !this.disable.has(r))),
        }
    }

    /** Selects only planet. */
    selectOnePlanet(planet: Planet): void {
        this.selectedPlanets.clear()
        this.selectPlanet(planet)
    }

    /** Adds planet to the selection. */
    selectPlanet(planet: Planet): void {
        this.selectedPlanets.add(planet)
        this.syncPlanetDisable()
    }

    /** Removes planet from the selection. */
    unselectPlanet(planet: Planet): void {
        this.selectedPlanets.delete(planet)
        this.syncPlanetDisable()
    }

    /** Returns the default resource priorities: one map of recipe weights per level. */
    getDefaultPriorityArray(): Map<RecipeLike, Rational>[] {
        const levels: Map<RecipeLike, Rational>[] = []
        for (const recipe of this.recipes.values()) {
            const pri = recipe.defaultPriority
            const product = recipe.products[0]
            if (pri === undefined || recipe.defaultWeight === undefined || product === undefined) {
                continue
            }
            while (levels.length < pri + 1) {
                levels.push(new Map())
            }
            // Fluids come in ten times larger amounts than items.
            const weight = product.item.phase === "fluid" ? recipe.defaultWeight.div(ten) : recipe.defaultWeight
            levels[pri]?.set(recipe, weight)
        }
        return levels
    }

    /** Resets the resource priorities to the defaults. */
    setDefaultPriority(): void {
        this.priorityValue = PriorityList.fromArray(this.defaultPriority)
        // An item may have no net producer at all. It needs its DisabledRecipe in the list.
        for (const item of this.items.values()) {
            if (this.isItemDisabled(item)) {
                this.addItemToMaxPriority(item)
            }
        }
    }

    /** Returns whether key names a recipe that can appear in the priority list. */
    isValidPriorityKey(key: string): boolean {
        if (key.startsWith(DISABLED_RECIPE_PREFIX)) {
            return this.items.has(key.slice(DISABLED_RECIPE_PREFIX.length))
        }
        return this.recipes.get(key)?.defaultPriority !== undefined
    }

    /** Applies priorities given as recipe keys and weights per level. Unknown keys are skipped. */
    setPriorities(tiers: ReadonlyArray<ReadonlyArray<readonly [string, Rational]>>): void {
        const levels = tiers.map(tier => {
            const m = new Map<RecipeLike, Rational>()
            for (const [key, weight] of tier) {
                let recipe: RecipeLike | undefined = this.recipes.get(key)
                if (recipe === undefined && key.startsWith(DISABLED_RECIPE_PREFIX)) {
                    recipe = this.items.get(key.slice(DISABLED_RECIPE_PREFIX.length))?.disableRecipe
                }
                if (recipe !== undefined) {
                    m.set(recipe, weight)
                }
            }
            return m
        })
        this.priority.applyArray(levels)
    }

    /** Returns whether the priorities equal the defaults. */
    isDefaultPriority(): boolean {
        return this.priority.equalArray(this.defaultPriority)
    }

    /**
     * Returns whether item needs its DisabledRecipe because no enabled recipe produces it on net.
     * Net-negative recipe loops can still make a solution infeasible.
     */
    isItemDisabled(item: Item): boolean {
        return !item.recipes.some(recipe => !this.disable.has(recipe) && recipe.isNetProducer(item))
    }

    /** Returns the enabled recipes for item, plus its DisabledRecipe if the item is disabled or ignored. */
    getRecipes(item: Item): RecipeLike[] {
        const recipes = item.recipes.filter(recipe => !this.disable.has(recipe))
        if (this.isItemDisabled(item) || this.ignore.has(item)) {
            // Recipes that also produce other, not ignored items stay in.
            const shared = recipes.filter(r => r.products.some(ing => !this.ignore.has(ing.item)))
            return [item.disableRecipe, ...shared]
        }
        return recipes
    }

    private addItemGraph(item: Item, recipes: Set<RecipeLike>): void {
        for (const recipe of this.getRecipes(item)) {
            if (recipes.has(recipe)) {
                continue
            }
            recipes.add(recipe)
            for (const ing of recipe.getIngredients()) {
                this.addItemGraph(ing.item, recipes)
            }
        }
    }

    /** Returns the recipes that may contribute to producing the given items. */
    getRecipeGraph(items: ReadonlyMap<Item, Rational>): Set<RecipeLike> {
        const graph = new Set<RecipeLike>()
        for (const item of items.keys()) {
            this.addItemGraph(item, graph)
        }
        return graph
    }

    /** Returns whether a build target sets a building count for recipe. */
    isFactoryTarget(recipe: RecipeNode): boolean {
        return this.buildTargets.some(target => target.recipe === recipe && target.changedBuilding)
    }

    /** Returns the building that crafts recipe, or null for recipes without a building. */
    getBuilding(recipe: RecipeNode): Building | null {
        if (!isRecipeLike(recipe) || recipe.category === null) {
            return null
        }
        const group = this.buildings.get(recipe.category)
        if (group === undefined) {
            throw new Error(`no building for category ${recipe.category}`)
        }
        return group.getBuilding(recipe)
    }

    /** Returns the group of building. */
    getBuildingGroup(building: Building): BuildingGroup {
        const [category] = building.categories
        const group = category === undefined ? undefined : this.buildings.get(category)
        if (group === undefined) {
            throw new Error(`building ${building.key} has no group`)
        }
        return group
    }

    /** Makes building the minimum building of its group and updates the module settings. */
    setMinimumBuilding(building: Building): void {
        const group = this.getBuildingGroup(building)
        group.building = building
        for (const [recipe, moduleSpec] of this.spec) {
            if (recipe.category !== null && this.buildings.get(recipe.category) === group) {
                const b = this.getBuilding(recipe)
                if (b !== null) {
                    moduleSpec.setBuilding(b, this)
                }
            }
        }
    }

    private initModuleSpec(recipe: RecipeNode, building: Building | null): ModuleSpec | undefined {
        if (!(recipe instanceof Recipe) || this.spec.has(recipe) || building === null || !building.canBeacon()) {
            return undefined
        }
        const m = new ModuleSpec(recipe, this)
        m.setBuilding(building, this)
        this.spec.set(recipe, m)
        return m
    }

    /** Creates module settings for every recipe of the solution that can take modules. */
    populateModuleSpec(totals: Totals): void {
        for (const recipe of totals.rates.keys()) {
            this.initModuleSpec(recipe, this.getBuilding(recipe))
        }
    }

    /** Returns the module settings of recipe, creating them if needed, or undefined if the building takes no modules. */
    getModuleSpec(recipe: RecipeNode): ModuleSpec | undefined {
        if (recipe instanceof Recipe) {
            const m = this.spec.get(recipe)
            if (m !== undefined) {
                return m
            }
        }
        return this.initModuleSpec(recipe, this.getBuilding(recipe))
    }

    /** Returns the productivity multiplier of recipe, such as 1.5 for +50%. */
    getProdEffect(recipe: RecipeNode): Rational {
        return this.getModuleSpec(recipe)?.prodEffect(this) ?? one
    }

    /** Sets the default module. Module slots that held the old default get the new one, or the secondary default if the new one does not fit. */
    setDefaultModule(module: Module | null): void {
        for (const [recipe, moduleSpec] of this.spec) {
            moduleSpec.modules.forEach((m, i) => {
                if (m !== this.defaultModule) {
                    return
                }
                if (!module || module.canUse(recipe)) {
                    moduleSpec.modules[i] = module
                } else if (!this.secondaryDefaultModule || this.secondaryDefaultModule.canUse(recipe)) {
                    moduleSpec.modules[i] = this.secondaryDefaultModule
                }
            })
        }
        this.defaultModule = module
    }

    /** Sets the module used where the default module does not fit. */
    setSecondaryDefaultModule(module: Module | null): void {
        if (this.secondaryDefaultModule !== this.defaultModule) {
            for (const [recipe, moduleSpec] of this.spec) {
                moduleSpec.modules.forEach((m, i) => {
                    if (m === this.secondaryDefaultModule && (!module || module.canUse(recipe))) {
                        moduleSpec.modules[i] = module
                    }
                })
            }
        }
        this.secondaryDefaultModule = module
    }

    /** Returns the module that new slots of recipe get: the default, the secondary default, or none. */
    getDefaultModule(recipe: Recipe): Module | null {
        if (this.defaultModule === null || this.defaultModule.canUse(recipe)) {
            return this.defaultModule
        }
        if (this.secondaryDefaultModule === null || this.secondaryDefaultModule.canUse(recipe)) {
            return this.secondaryDefaultModule
        }
        return null
    }

    /** Returns whether both default beacon slots are empty. */
    isDefaultDefaultBeacon(): boolean {
        return this.defaultBeacon[0] === null && this.defaultBeacon[1] === null
    }

    /** Sets default beacon slot i. Recipes that used the old default get the new one. */
    setDefaultBeacon(module: Module | null, i: 0 | 1): void {
        for (const [recipe, moduleSpec] of this.spec) {
            if (moduleSpec.beaconModules[i] === this.defaultBeacon[i] && (!module || module.canUse(recipe))) {
                moduleSpec.beaconModules[i] = module
            }
        }
        this.defaultBeacon[i] = module
    }

    /** Sets the default beacon count. Recipes that used the old default get the new one. */
    setDefaultBeaconCount(count: Rational): void {
        for (const moduleSpec of this.spec.values()) {
            if (moduleSpec.beaconCount.equal(this.defaultBeaconCount)) {
                moduleSpec.beaconCount = count
            }
        }
        this.defaultBeaconCount = count
    }

    /** Returns crafts per second of one building for recipe, or null for recipes without a building. */
    getRecipeRate(recipe: RecipeNode): Rational | null {
        const building = this.getBuilding(recipe)
        if (building === null || !(recipe instanceof Recipe)) {
            return null
        }
        return building.getRecipeRate(this, recipe)
    }

    /** Returns the number of buildings needed to run recipe at rate crafts per second. */
    getCount(recipe: RecipeNode, rate: Rational): Rational {
        const building = this.getBuilding(recipe)
        if (building === null || !(recipe instanceof Recipe)) {
            return zero
        }
        return building.getCount(this, recipe, rate)
    }

    /** Returns the number of belts needed for rate items per second. */
    getBeltCount(rate: Rational): Rational {
        return rate.div(this.belt.rate)
    }

    /** Returns the power use of recipe at rate crafts per second, including module effects and idle drain. */
    getPowerUsage(recipe: RecipeNode, rate: Rational): PowerUsage {
        const building = this.getBuilding(recipe)
        if (building === null) {
            return { fuel: null, power: zero }
        }

        const count = this.getCount(recipe, rate)
        if (building.fuel !== null) {
            return { fuel: building.fuel, power: building.power.mul(count) }
        }

        const powerEffect = this.getModuleSpec(recipe)?.powerEffect() ?? one
        const power = building.power.mul(count).mul(powerEffect).add(building.drain().mul(count.ceil()))
        return { fuel: "electric", power }
    }

    /** Adds a build target for itemKey, or for the default item. Returns the target. */
    addTarget(itemKey: string = DEFAULT_ITEM_KEY): BuildTarget {
        const item = this.items.get(itemKey)
        if (item === undefined) {
            throw new Error(`unknown item: ${itemKey}`)
        }
        const target = new BuildTarget(this.buildTargets.length, itemKey, item, this.itemGroups)
        this.buildTargets.push(target)
        d3.select("#targets").insert(() => target.element, "#plusButton")
        return target
    }

    /** Removes a build target and its element. */
    removeTarget(target: BuildTarget): void {
        this.buildTargets.splice(target.index, 1)
        for (const later of this.buildTargets.slice(target.index)) {
            later.index--
        }
        d3.select(target.element).remove()
    }

    /** Toggles whether item is ignored, which means it is supplied from outside the factory. */
    toggleIgnore(item: Item): void {
        let updateTargets = false
        if (this.ignore.has(item)) {
            this.ignore.delete(item)
            if (!this.isItemDisabled(item)) {
                this.priority.removeRecipe(item.disableRecipe)
                updateTargets = true
            }
        } else {
            this.ignore.add(item)
            if (!this.isItemDisabled(item)) {
                let level = this.priority.getFirstLevel()
                if (level === null || !Array.from(level).some(r => r.recipe.isDisable())) {
                    level = this.priority.addPriorityBefore(level)
                }
                this.priority.addRecipe(item.disableRecipe, hundred, level)
                updateTargets = true
            }
        }

        if (updateTargets) {
            for (const target of this.buildTargets) {
                if (target.item === item) {
                    target.displayRecipes()
                    target.rateChanged()
                }
            }
        }
    }

    /** Solves for the current build targets. Targets with the same item and recipe are merged. */
    solve(): Totals {
        const outputs: Output[] = []
        for (const target of this.buildTargets) {
            const item: Item = target.item
            const rate: Rational = target.getRate()
            const recipe: RecipeLike | null = target.changedBuilding ? target.recipe : null
            const existing = outputs.find(o => o.item === item && o.recipe === recipe)
            if (existing) {
                existing.rate = existing.rate.add(rate)
            } else {
                outputs.push({ item, rate, recipe })
            }
        }

        const { totals, debug } = solve(this, outputs)
        this.lastPartial = debug.partial
        this.lastTableau = debug.tableau
        this.lastMetadata = debug.metadata
        this.lastSolution = debug.solution
        return totals
    }

    /** Writes the current settings into the URL fragment. Compression runs asynchronously. */
    setHash(): void {
        const version = ++this.hashVersion
        void encodeSettings(formatSettings()).then(encoded => {
            if (version === this.hashVersion) {
                window.location.hash = "#" + encoded
            }
        })
    }

    /** Solves again and redisplays. Call this when a change affects recipe rates. */
    updateSolution(): void {
        this.lastTotals = this.solve()
        this.populateModuleSpec(this.lastTotals)
        this.display()
    }

    /** Redisplays the last solution without solving. Enough for changes that only affect building counts or formatting. */
    display(): void {
        for (const target of this.buildTargets) {
            target.getRate()
        }
        displayItems(this, this.lastTotals)
        if (currentTab === "graph") {
            renderTotals(this.lastTotals, this.ignore)
        }
        reapTooltips()
        this.setHash()
        if (this.debug) {
            renderDebug()
        }
    }
}

declare global {
    interface Window {
        /** The calculator state, exposed for debugging in the browser console. */
        spec: FactorySpecification
    }
}

/** The calculator state. */
export const spec: FactorySpecification = new FactorySpecification()
window.spec = spec

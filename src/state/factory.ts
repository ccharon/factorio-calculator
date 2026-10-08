// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import { Rational, zero, one } from "../core/rational.ts"
import { type Output, type SolveResult, type SolverDebug, solve } from "../core/solve.ts"
import type { Totals } from "../core/totals.ts"
import type { Belt } from "../data/belt.ts"
import type { Building, BuildingContext } from "../data/building.ts"
import type { Fuel } from "../data/fuel.ts"
import type { ItemGroups } from "../data/group.ts"
import { FLUID_SCALE, type Item } from "../data/item.ts"
import { type Module, type ModuleDefaults, ModuleSpec } from "../data/module.ts"
import type { Planet } from "../data/planet.ts"
import type { ProductivityResearch } from "../data/research.ts"
import { QUALITY_KINDS, Quality, type QualityKind, qualityDistribution } from "../data/quality.ts"
import {
    DEFAULT_RESOURCE_WEIGHT, DISABLED_RECIPE_PREFIX, ELECTRICITY, HEAT, Ingredient, ReactorRecipe, Recipe, type RecipeContext, type RecipeLike, type RecipeNode, isEnergyKey,
} from "../data/recipe.ts"
import { renderDebug } from "../ui/debug.ts"
import { displayItems, setSolving } from "../ui/display.ts"
import { currentTab } from "../ui/events.ts"
import { renderPriorities } from "../ui/priority-view.ts"
import type { BuildTarget } from "../ui/target.ts"
import { reapTooltips } from "../ui/tooltip.ts"
import { renderTotals } from "../visualize/visualize.ts"
import { Formatter } from "./align.ts"
import { type BuildingGroup, getBuildingGroups } from "./building-groups.ts"
import { type PowerUsage, getEnergyIngredients, getPowerUsage, reactorNeighbours } from "./energy.ts"
import { FuelChoice } from "./fuel-choice.ts"
import { formatSettings } from "./fragment.ts"
import { PriorityList, type PriorityLevelMap } from "./priority.ts"
import { SolveCancelled, runSimplexInWorker } from "./solver-thread.ts"
import { encodeSettings } from "./url-codec.ts"

/** Planet selected when the URL names none. */
export const DEFAULT_PLANET = "nauvis"
/** Belt used for belt counts when the URL names none. */
export const DEFAULT_BELT = "transport-belt"
/** A single reactor without neighbours. */
export const DEFAULT_REACTOR_BLOCK = 0
const NORMAL_QUALITY = new Quality("normal", "Normal", 0, 0, 0)
const fluidScale = Rational.from_integer(FLUID_SCALE)

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
export class FactorySpecification implements BuildingContext, ModuleDefaults, RecipeContext {
    items: Map<string, Item> = new Map()
    recipes: Map<string, Recipe> = new Map()
    modules: Map<string, Module> = new Map()
    planets: Map<string, Planet> = new Map()
    /** Building groups by key. */
    buildings: Map<string, BuildingGroup> = new Map()
    /** Building group of each recipe that needs a building. */
    recipeGroups: Map<Recipe, BuildingGroup> = new Map()
    buildingKeys: Map<string, Building> = new Map()
    belts: Map<string, Belt> = new Map()
    /** The fuels and the fuel chosen per fuel category. */
    readonly fuel: FuelChoice = new FuelChoice()
    itemGroups: ItemGroups = []

    buildTargets: BuildTarget[] = []

    /** Module settings by recipe. */
    readonly spec: Map<Recipe, ModuleSpec> = new Map()
    defaultModule: Module | null = null
    secondaryDefaultModule: Module | null = null
    readonly defaultBeacon: [Module | null, Module | null] = [null, null]
    defaultBeaconCount: Rational = zero

    miningProd: Rational = zero
    /** Length of the 2×N block of nuclear reactors, or 0 for a single reactor. */
    reactorBlock: number = DEFAULT_REACTOR_BLOCK
    /** Quality levels from lowest to highest. */
    qualities: Quality[] = []
    // Before the dataset is loaded, every quality setting is the normal quality.
    /** Global qualities. Recipes without their own setting use them. */
    readonly globalQuality: Map<QualityKind, Quality> = new Map(QUALITY_KINDS.map(kind => [kind, NORMAL_QUALITY]))
    /** Qualities that differ from the global ones, per recipe. */
    readonly recipeQuality: Map<Recipe, Map<QualityKind, Quality>> = new Map()

    /** Recipe productivity technologies, sorted by order. */
    research: ProductivityResearch[] = []
    /** Researched level of each technology. Missing entries are level 0. */
    readonly researchLevels: Map<ProductivityResearch, number> = new Map()

    readonly ignore: Set<Item> = new Set()
    readonly disable: Set<Recipe> = new Set()
    /** The planet the factory stands on, or null before one is selected. */
    planet: Planet | null = null
    /** Recipes the planet disables, or null before a planet is selected. */
    planetaryBaseline: Set<Recipe> | null = null

    defaultPriority: PriorityLevelMap[] = []

    readonly format: Formatter = new Formatter()

    lastTotals: Totals | null = null
    lastPartial: SolverDebug["partial"] | null = null
    lastTableau: SolverDebug["tableau"] = null
    lastMetadata: SolverDebug["metadata"] = null
    lastSolution: SolverDebug["solution"] = null
    /** Settles when the solution of the latest updateSolution() call is shown. Browser tests wait for it. */
    solved: Promise<void> = Promise.resolve()
    // Counts updateSolution() calls, so that a slower older run cannot replace a newer solution.
    private solveRuns = 0

    debug = false

    private beltValue: Belt | null = null
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

    /**
     * Returns the fuel or electricity the building of recipe uses per craft, or an empty list.
     * Required by RecipeContext.
     */
    getEnergyIngredients(recipe: Recipe): Ingredient[] {
        return getEnergyIngredients(this, recipe)
    }

    /** Returns the fuel, electricity and heat that the building of recipe uses. */
    getEnergyItems(recipe: RecipeLike): Item[] {
        return recipe instanceof Recipe ? this.getEnergyIngredients(recipe).map(ing => ing.item) : []
    }

    /** The abstract item for heat, in MJ. */
    get heat(): Item {
        return required(this.items.get(HEAT) ?? null, "heat")
    }

    /** The abstract item for electric energy, in MJ. */
    get electricity(): Item {
        return required(this.items.get(ELECTRICITY) ?? null, "electricity")
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
        research: ProductivityResearch[],
        qualities: Quality[],
    ): void {
        this.items = items
        this.recipes = recipes
        this.planets = planets
        this.modules = modules

        const [groups, recipeGroups] = getBuildingGroups(buildings, recipes.values())
        this.buildings = groups
        this.recipeGroups = recipeGroups
        this.buildingKeys = new Map(buildings.map(b => [b.key, b]))

        this.belts = belts
        this.beltValue = belts.get(DEFAULT_BELT) ?? null
        this.fuel.setFuels(fuels)

        this.miningProd = zero
        this.reactorBlock = DEFAULT_REACTOR_BLOCK
        this.itemGroups = itemGroups
        this.research = research
        this.qualities = qualities
        const normal = qualities[0] ?? NORMAL_QUALITY
        for (const kind of QUALITY_KINDS) {
            this.globalQuality.set(kind, normal)
        }
        this.recipeQuality.clear()
        this.researchLevels.clear()
        this.defaultPriority = this.getDefaultPriorityArray()
        this.priorityValue = null
    }

    /** Enables all recipes. */
    setDefaultDisable(): void {
        this.disable.clear()
    }

    // Puts the item's DisabledRecipe into the least preferred level of list, unless it is already
    // listed because the item is ignored.
    private addItemToMaxPriority(item: Item, list: PriorityList = this.priority): void {
        if (list.getResource(item.disableRecipe) === null) {
            this.addDisableRecipe(item, "last", list)
        }
    }

    // Adds the item's DisabledRecipe to the most or least preferred level of list. That level is a new
    // one unless it already holds DisabledRecipes.
    private addDisableRecipe(item: Item, end: "first" | "last", list: PriorityList = this.priority): void {
        let level = end === "first" ? list.getFirstLevel() : list.getLastLevel()
        if (level === null || !Array.from(level).some(r => r.recipe.isDisable())) {
            level = list.addPriorityBefore(end === "first" ? level : null)
        }
        list.addRecipe(item.disableRecipe, DEFAULT_RESOURCE_WEIGHT, level)
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

    // Disables exactly the recipes that the planet disables.
    private syncPlanetDisable(planet: Planet): void {
        const planetDisable = planet.disable
        this.planetaryBaseline = new Set(planetDisable)
        for (const r of Array.from(this.disable).filter(r => !planetDisable.has(r))) {
            this.setEnable(r)
        }

        for (const r of planetDisable) {
            if (!this.disable.has(r)) {
                this.setDisable(r)
            }
        }

        this.updateModuleBuildings()
    }

    /** Returns whether the default planet is selected. */
    isDefaultPlanet(): boolean {
        return this.planets.size <= 1 || this.planet?.key === DEFAULT_PLANET
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

    /** Puts the factory on planet. */
    selectPlanet(planet: Planet): void {
        this.planet = planet
        this.syncPlanetDisable(planet)
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

            const weight = product.item.phase === "fluid" ? recipe.defaultWeight.div(fluidScale) : recipe.defaultWeight
            levels[pri]?.set(recipe, weight)
        }
        return levels
    }

    /**
     * Returns the default resource priorities for the enabled recipes and ignored items. An item
     * without a net producer gets its DisabledRecipe in the least preferred level, an ignored item
     * in the most preferred one, as toggleIgnore() does.
     */
    private getDefaultPriorityList(): PriorityList {
        const list = PriorityList.fromArray(this.defaultPriority)
        for (const item of this.items.values()) {
            if (this.isItemDisabled(item)) {
                this.addItemToMaxPriority(item, list)
            }
        }
        for (const item of this.ignore) {
            if (!this.isItemDisabled(item)) {
                this.addDisableRecipe(item, "first", list)
            }
        }
        return list
    }

    /** Resets the resource priorities to the defaults for the enabled recipes and ignored items. */
    setDefaultPriority(): void {
        this.priorityValue = this.getDefaultPriorityList()
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
        return this.priority.equalArray(this.getDefaultPriorityList().toArray())
    }

    /**
     * Returns whether item needs its DisabledRecipe because no enabled recipe produces it on net.
     * Net-negative recipe loops can still make a solution infeasible.
     */
    isItemDisabled(item: Item): boolean {
        return !this.producersOf(item).some(recipe => !this.disable.has(recipe.base) && recipe.isNetProducer(item, this))
    }

    // The recipes that can make item: its own recipes, and for a variant also the recipes of lower
    // qualities whose quality effect reaches it. Variants of recipes also make fluids, but only
    // variant items take them into the graph.
    private producersOf(item: Item): Recipe[] {
        const own = item.recipes.filter(recipe => item.quality !== null || recipe.quality === null)
        const quality = item.quality
        if (quality === null) {
            return own
        }
        const raising: Recipe[] = []
        for (const base of item.base.recipes.filter(recipe => recipe.quality === null)) {
            for (const recipe of [base, ...base.variants.values()]) {
                if ((recipe.quality?.level ?? 0) < quality.level && this.getProducts(recipe).some(ing => ing.item === item)) {
                    raising.push(recipe)
                }
            }
        }
        return [...own, ...raising]
    }

    /** Returns the products of recipe per craft, with solid products spread over the qualities that its quality effect reaches. */
    getProducts(recipe: RecipeNode): readonly Ingredient[] {
        if (!(recipe instanceof Recipe) || !recipe.allowQuality) {
            return recipe.products
        }
        const effect = this.getModuleSpec(recipe)?.qualityEffect(this) ?? zero
        if (!zero.less(effect)) {
            return recipe.products
        }
        const shares = qualityDistribution(recipe.quality ?? this.qualities[0] ?? NORMAL_QUALITY, effect)
        return recipe.products.flatMap(ing => {
            if (ing.item.base.variants.size === 0) {
                return [ing]
            }
            const spread = Array.from(shares, ([quality, share]) => new Ingredient(ing.item.variant(quality), ing.amount.mul(share), ing.ignoredByProductivity.mul(share)))
            return spread.filter(product => !product.amount.isZero())
        })
    }

    /** Returns the enabled recipes for item, plus its DisabledRecipe if the item is disabled or ignored. */
    getRecipes(item: Item): RecipeLike[] {
        let recipes: RecipeLike[] = this.producersOf(item).filter(recipe => !this.disable.has(recipe.base))
        // Electricity and heat come from outside only while no source of them is enabled.
        if (isEnergyKey(item.key) && recipes.some(r => !r.isResource())) {
            recipes = recipes.filter(r => !r.isResource())
        }
        if (this.isItemDisabled(item) || this.ignore.has(item)) {
            // Recipes that also produce other, not ignored items stay in.
            const shared = recipes.filter(r => this.getProducts(r).some(ing => !this.ignore.has(ing.item)))
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
            for (const ing of recipe.getIngredients(this)) {
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

    /** Returns whether building works on the planet. Without a planet every building works. */
    buildingWorks(building: Building): boolean {
        return this.planet === null || building.worksOn(this.planet.properties)
    }

    /** Returns the building that crafts recipe, or null for recipes without a building. */
    getBuilding(recipe: RecipeNode): Building | null {
        if (!(recipe instanceof Recipe)) {
            return null
        }
        // A variant has the buildings of its normal recipe.
        const group = this.recipeGroups.get(recipe.base)
        if (group === undefined) {
            return null
        }
        return group.getBuilding(b => this.buildingWorks(b))
    }

    /** Selects building in group and updates the module settings. */
    setGroupBuilding(group: BuildingGroup, building: Building): void {
        group.building = building
        this.updateModuleBuildings()
    }

    /** Gives the module settings of every recipe the building that now crafts it. */
    updateModuleBuildings(): void {
        for (const [recipe, moduleSpec] of this.spec) {
            const b = this.getBuilding(recipe)
            if (b !== null && b !== moduleSpec.building) {
                moduleSpec.setBuilding(b, this)
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

    /** Returns the item with key, which may name a variant as "<item>@<quality>". */
    findItem(key: string): Item | undefined {
        return this.findVariant(this.items, key)
    }

    /** Returns the recipe with key, which may name a variant as "<recipe>@<quality>". */
    findRecipe(key: string): Recipe | undefined {
        return this.findVariant(this.recipes, key)
    }

    // Looks up "<key>" in objects, or "<key>@<quality>" among the variants of what it finds there.
    private findVariant<T extends { readonly variants: ReadonlyMap<Quality, T> }>(objects: ReadonlyMap<string, T>, key: string): T | undefined {
        const [baseKey = "", qualityKey] = key.split("@")
        const object = objects.get(baseKey)
        if (qualityKey === undefined || object === undefined) {
            return object
        }
        const quality = this.qualities.find(q => q.key === qualityKey)
        return quality === undefined ? undefined : object.variants.get(quality)
    }

    /** Returns the quality of the given kind for recipe: its own setting, or the global one. */
    getQuality(recipe: Recipe, kind: QualityKind): Quality {
        return this.recipeQuality.get(recipe)?.get(kind) ?? this.globalQuality.get(kind) ?? NORMAL_QUALITY
    }

    /** Sets the quality of the given kind for recipe. The global quality removes the recipe's own setting. */
    setRecipeQuality(recipe: Recipe, kind: QualityKind, quality: Quality): void {
        const qualities = this.recipeQuality.get(recipe) ?? new Map<QualityKind, Quality>()
        if (quality === this.globalQuality.get(kind)) {
            qualities.delete(kind)
        } else {
            qualities.set(kind, quality)
        }
        if (qualities.size === 0) {
            this.recipeQuality.delete(recipe)
        } else {
            this.recipeQuality.set(recipe, qualities)
        }
    }

    /** Returns the productivity multiplier of recipe, such as 1.5 for +50%, limited by the recipe's productivity cap. */
    getProdEffect(recipe: RecipeNode): Rational {
        let effect = this.getModuleSpec(recipe)?.prodEffect(this) ?? one
        if (!(recipe instanceof Recipe)) {
            return effect
        }
        if (recipe instanceof ReactorRecipe) {
            effect = effect.add(recipe.neighbourBonus.mul(reactorNeighbours(this.reactorBlock)))
        }
        for (const [research, level] of this.researchLevels) {
            effect = effect.add(research.bonus(recipe.base, level))
        }
        if (recipe.maximumProductivity !== null) {
            const cap = one.add(recipe.maximumProductivity)
            return cap.less(effect) ? cap : effect
        }
        return effect
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

    /** Returns the power use of recipe at rate crafts per second, including module effects and idle drain. */
    getPowerUsage(recipe: RecipeNode, rate: Rational): PowerUsage {
        return getPowerUsage(this, recipe, rate)
    }

    /** Returns the number of belts needed for rate items per second. */
    getBeltCount(rate: Rational): Rational {
        return rate.div(this.belt.rate)
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
                this.addDisableRecipe(item, "first")
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

    // Solves for the build targets in a Web Worker. Targets with the same item and recipe are merged.
    private solve(): Promise<SolveResult> {
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

        return solve(this, outputs, runSimplexInWorker)
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

    /**
     * Solves again and shows the solution when it is ready. A newer call cancels or discards an
     * older one, so only the solution of the latest settings is shown.
     */
    updateSolution(): void {
        const run = ++this.solveRuns
        setSolving(true)
        this.solved = this.solve().then(({ totals, debug }) => {
            if (run !== this.solveRuns) {
                return
            }
            this.lastTotals = totals
            this.lastPartial = debug.partial
            this.lastTableau = debug.tableau
            this.lastMetadata = debug.metadata
            this.lastSolution = debug.solution
            this.populateModuleSpec(totals)
            this.display()
            setSolving(false)
        }, (error: unknown) => {
            if (error instanceof SolveCancelled) {
                return
            }
            setSolving(false)
            console.error(error)
        })
    }

    /** Redisplays the last solution without solving. Enough for changes that only affect building counts or formatting. */
    display(): void {
        for (const target of this.buildTargets) {
            target.getRate()
        }
        displayItems(this, this.lastTotals)
        renderPriorities(this.priority)
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

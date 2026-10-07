/*Copyright 2026 Christian Charon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/

// Types of the dataset JSON in public/data/. They mirror src/data/dataset.schema.json, which
// tests/dataset.test.js validates every dataset against. Energy is in J, power in W.

/** English display name of a prototype. */
export interface LocalizedName {
    en: string
}

/** Position of an icon in the sprite sheet, counted in cells. */
export interface IconPosition {
    icon_col: number
    icon_row: number
}

/** Fields shared by every named prototype with an icon. */
export interface NamedPrototype extends IconPosition {
    key: string
    localized_name: LocalizedName
}

export type ItemType = "item" | "fluid"

export interface DatasetIngredient {
    type: ItemType
    name: string
    amount: number
}

/** A product. amount is the expected amount per craft, with probabilities already applied. */
export interface DatasetProduct extends DatasetIngredient {
    /** Expected part of amount that productivity does not multiply. */
    ignored_by_productivity?: number
    temperature?: number
    percent_spoiled?: number
}

export interface SurfaceConditionData {
    property: string
    min?: number
    max?: number
}

export type EffectName = "speed" | "productivity" | "consumption" | "pollution" | "quality"

/** Module effect values, such as speed: 0.5 for +50%. */
export type Effect = Partial<Record<EffectName, number>>

export interface EnergySource {
    type: "electric" | "burner" | "heat" | "fluid" | "void"
    fuel_categories?: string[]
    fuel_category?: string
    effectivity?: number
    emissions_per_minute?: Record<string, number>
}

export interface DatasetItem extends NamedPrototype {
    type: string
    group: string
    subgroup: string
    order: string
    stack_size?: number
    /** Weight in grams, which limits rocket cargo. */
    weight?: number
}

export interface DatasetFluid {
    item_key: string
    default_temperature: number
    max_temperature?: number
    heat_capacity: number
    fuel_value?: number
}

export interface DatasetFuel {
    item_key: string
    /** Fuel categories, such as chemical or nutrients. */
    categories: string[]
    value: number
}

export interface DatasetSpoilage {
    from_item: string
    to_item: string
    time: number
}

export interface DatasetRecipe extends NamedPrototype {
    categories: string[]
    energy_required: number
    allow_productivity: boolean
    maximum_productivity?: number
    ingredients: DatasetIngredient[]
    results: DatasetProduct[]
    main_product?: string
    surface_conditions?: SurfaceConditionData[]
    order: string
    subgroup: string
    hidden?: true
}

/** Fields shared by all powered machines. */
export interface DatasetMachine extends NamedPrototype {
    energy_usage?: number
    energy_source?: EnergySource
    module_slots: number
    allowed_effects?: EffectName[]
    surface_conditions?: SurfaceConditionData[]
    /** Heat in W that keeps the machine from freezing on planets that require heating. */
    heating_energy?: number
}

export interface DatasetCraftingMachine extends DatasetMachine {
    crafting_categories: string[]
    crafting_speed: number
    /** Crafting speed by quality key. */
    crafting_speed_by_quality?: Record<string, number>
    prod_bonus: number
}

export interface DatasetRocketSilo extends DatasetMachine {
    crafting_categories: string[]
    crafting_speed: number
    /** Crafting speed by quality key. */
    crafting_speed_by_quality?: Record<string, number>
    rocket_parts_required: number
}

export interface DatasetMiningDrill extends DatasetMachine {
    mining_speed: number
    resource_categories: string[]
    resource_drain_rate_percent?: number
    takes_fluid: boolean
}

export interface DatasetOffshorePump extends NamedPrototype {
    /** Fluid units per tick. */
    pumping_speed: number
}

/** A generator that turns hot fluid into electricity. */
export interface DatasetGenerator extends NamedPrototype {
    fluid: string
    /** Fluid units per second at full output. */
    fluid_usage: number
    maximum_temperature: number
    effectivity: number
}

export interface DatasetSolarPanel extends NamedPrototype {
    /** Peak output in W. */
    production: number
    surface_conditions?: SurfaceConditionData[]
}

/** A reactor that burns fuel into heat, such as the nuclear reactor or the heating tower. */
export interface DatasetReactor extends NamedPrototype {
    /** Heat output in W. */
    consumption: number
    /** Extra heat output per active neighbouring reactor, such as 1 for +100%. */
    neighbour_bonus: number
    energy_source: EnergySource
}

/** A fusion reactor: turns a coolant into plasma, using electricity and fuel. */
export interface DatasetFusionReactor extends NamedPrototype {
    /** Electric power in W. */
    power_input: number
    /** Fluid units per second. */
    fluid_usage: number
    input_fluid: string
    output_fluid: string
    burner: EnergySource
}

/** A fusion generator: turns plasma into electricity and hot coolant. */
export interface DatasetFusionGenerator extends NamedPrototype {
    /** Electric output in W at full plasma flow. */
    max_power_output: number
    /** Fluid units per second. */
    fluid_usage: number
    input_fluid: string
    output_fluid: string
}

export interface DatasetBoiler extends NamedPrototype {
    energy_consumption: number
    energy_source: EnergySource
    target_temperature: number
}

export interface DatasetBelt extends NamedPrototype {
    /** Tiles per tick. */
    speed: number
}

export interface DatasetBeacon {
    key: string
    energy_usage: number
    distribution_effectivity: number
    distribution_effectivity_bonus_per_quality_level?: number
    module_slots: number
    allowed_effects: EffectName[]
    /** Effect multiplier by number of beacons affecting one machine, starting at one beacon. */
    profile: number[]
}

export interface DatasetModule {
    item_key: string
    category: string
    tier: number
    effect: Effect
    /** Effects by quality key. Quality raises the positive effects. */
    effect_by_quality?: Record<string, Effect>
}

/** A quality level such as uncommon. */
export interface DatasetQuality extends NamedPrototype {
    level: number
}

export interface DatasetAgriculturalTower extends DatasetMachine {
    radius?: number
    /** Number of plants one tower tends. */
    plots: number
}

export interface PlanetResources {
    resource: string[]
    offshore: string[]
    plants: string[]
    /** Asteroid chunks that a space platform collects here. */
    asteroid: string[]
}

export interface DatasetPlanet extends NamedPrototype {
    order: string
    /** Values that differ from the surface property defaults. */
    surface_properties: Record<string, number>
    /** Average light level over a day, between 0 and 1. Solar panels produce this share of their peak. */
    solar_factor: number
    /** True if entities freeze here without heat, as on Aquilo. */
    requires_heating: boolean
    resources: PlanetResources
}

export interface DatasetResource extends NamedPrototype {
    category: string
    mining_time: number
    results: DatasetProduct[]
    required_fluid?: string
    /** Fluid per 10 mining cycles. */
    fluid_amount?: number
    infinite?: true
    order?: string
}

/** One recipe a productivity technology affects, with the bonus per level, such as 0.1 for +10%. */
export interface RecipeProductivityEffect {
    recipe: string
    change: number
}

/** A technology that raises the productivity of recipes per level. */
export interface DatasetRecipeProductivity extends NamedPrototype {
    order: string
    /** Highest level. Absent for infinite research. */
    max_level?: number
    effects: RecipeProductivityEffect[]
}

export interface DatasetPlant extends NamedPrototype {
    order: string
    seed: string
    growth_ticks: number
    results: DatasetProduct[]
    surface_conditions?: SurfaceConditionData[]
}

export interface DatasetSurfaceProperty {
    name: string
    default_value: number
}

export interface ItemGroupData {
    order: string
    /** Subgroup name to sort order. */
    subgroups: Record<string, string>
}

export interface ExtraSprite extends IconPosition {
    name: string
}

export interface SpriteSheetData {
    /** MD5 of public/images/sprite-sheet-<hash>.png. */
    hash: string
    width: number
    height: number
    extra: Record<string, ExtraSprite>
}

/** The complete dataset file. */
export interface Dataset {
    version: string
    groups: Record<string, ItemGroupData>
    items: DatasetItem[]
    fluids: DatasetFluid[]
    fuel: DatasetFuel[]
    spoilage: DatasetSpoilage[]
    recipes: DatasetRecipe[]
    crafting_machines: DatasetCraftingMachine[]
    rocket_silo: DatasetRocketSilo[]
    mining_drills: DatasetMiningDrill[]
    offshore_pumps: DatasetOffshorePump[]
    boilers: DatasetBoiler[]
    generators: DatasetGenerator[]
    solar_panels: DatasetSolarPanel[]
    reactors: DatasetReactor[]
    fusion_reactors: DatasetFusionReactor[]
    fusion_generators: DatasetFusionGenerator[]
    belts: DatasetBelt[]
    beacon: DatasetBeacon
    modules: DatasetModule[]
    agricultural_tower: DatasetAgriculturalTower[]
    planets: DatasetPlanet[]
    resources: DatasetResource[]
    plants: DatasetPlant[]
    surface_properties: DatasetSurfaceProperty[]
    recipe_productivity: DatasetRecipeProductivity[]
    /** Quality levels from lowest to highest. */
    qualities: DatasetQuality[]
    /** Rocket cargo capacity in grams. */
    rocket_lift_weight: number
    sprites: SpriteSheetData
}

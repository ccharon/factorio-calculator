// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// The parts of Factorio's data.raw dump that the converter reads. Lua serializes empty tables as {},
// so list fields can also be an empty object; convert.ts reads them through asArray().

/** A value that is a list in Lua, which the dump writes as {} when the list is empty. */
export type LuaList<T> = readonly T[] | Readonly<Record<string, never>>

/** Fields every prototype has. */
export interface RawPrototype {
    readonly name: string
    readonly type?: string
    readonly order?: string
    readonly subgroup?: string
    readonly hidden?: boolean
    /** Parameter prototypes are placeholders for blueprint parameters. */
    readonly parameter?: boolean
}

export interface RawGroup extends RawPrototype {
    readonly group: string
}

export interface RawSurfaceCondition {
    readonly property: string
    readonly min?: number
    readonly max?: number
}

export interface RawEnergySource {
    readonly type: "electric" | "burner" | "heat" | "fluid" | "void"
    readonly fuel_categories?: LuaList<string>
    readonly effectivity?: number
    readonly emissions_per_minute?: Readonly<Record<string, number>>
    readonly output_flow_limit?: string
}

export interface RawItem extends RawPrototype {
    readonly stack_size?: number
    readonly fuel_value?: string
    readonly fuel_categories?: LuaList<string>
    readonly fuel_category?: string
    readonly spoil_result?: string
    readonly spoil_ticks?: number
    readonly plant_result?: string
    /** Modules only. */
    readonly category?: string
    readonly tier?: number
    readonly effect?: Readonly<Record<string, number>>
}

export interface RawFluid extends RawPrototype {
    readonly default_temperature?: number
    readonly max_temperature?: number
    readonly heat_capacity?: string
    readonly fuel_value?: string
}

export interface RawIngredient {
    readonly type?: "item" | "fluid"
    readonly name: string
    readonly amount: number
}

export interface RawProduct {
    readonly type?: "item" | "fluid"
    readonly name: string
    readonly amount?: number
    readonly amount_min?: number
    readonly amount_max?: number
    readonly probability?: number
    readonly independent_probability?: number
    readonly shared_probability?: { readonly min: number, readonly max: number }
    readonly extra_count_fraction?: number
    readonly ignored_by_productivity?: number
    readonly temperature?: number
    readonly percent_spoiled?: number
}

export interface RawRecipe extends RawPrototype {
    readonly categories?: LuaList<string>
    readonly energy_required?: number
    readonly allow_productivity?: boolean
    readonly allow_quality?: boolean
    readonly maximum_productivity?: number
    readonly ingredients?: LuaList<RawIngredient>
    readonly results?: LuaList<RawProduct>
    readonly main_product?: string
    readonly surface_conditions?: LuaList<RawSurfaceCondition>
}

export interface RawFluidBox {
    readonly filter?: string
}

/** A trigger effect of a dying asteroid. */
export interface RawTriggerEffect {
    readonly type: string
    readonly asteroid_name?: string
    readonly entity_name?: string
}

export interface RawMinable {
    readonly mining_time?: number
    readonly result?: string
    readonly count?: number
    readonly results?: LuaList<RawProduct>
    readonly required_fluid?: string
    readonly fluid_amount?: number
}

/** An entity. The fields depend on the entity type; each is read only for the types that have it. */
export interface RawEntity extends RawPrototype {
    readonly energy_usage?: string
    readonly energy_source?: RawEnergySource
    readonly burner?: RawEnergySource
    readonly module_slots?: number
    readonly allowed_effects?: LuaList<string>
    readonly surface_conditions?: LuaList<RawSurfaceCondition>
    readonly heating_energy?: string
    readonly crafting_categories?: LuaList<string>
    readonly crafting_speed?: number
    readonly effect_receiver?: { readonly base_effect?: { readonly productivity?: number } }
    readonly rocket_parts_required?: number
    readonly mining_speed?: number
    readonly resource_categories?: LuaList<string>
    readonly resource_drain_rate_percent?: number
    readonly input_fluid_box?: RawFluidBox
    readonly output_fluid_box?: RawFluidBox
    readonly fluid_box?: RawFluidBox
    readonly pumping_speed?: number
    readonly energy_consumption?: string
    readonly target_temperature?: number
    readonly fluid_usage_per_tick?: number
    readonly maximum_temperature?: number
    readonly effectivity?: number
    readonly production?: string
    readonly consumption?: string
    readonly neighbour_bonus?: number
    readonly power_input?: string
    readonly max_fluid_usage?: number
    readonly speed?: number
    readonly distribution_effectivity?: number
    readonly distribution_effectivity_bonus_per_quality_level?: number
    readonly profile?: LuaList<number>
    readonly growth_grid_tile_size?: number
    readonly collision_box?: readonly [readonly [number, number], readonly [number, number]]
    readonly radius?: number
    readonly category?: string
    readonly minable?: RawMinable
    readonly infinite?: boolean
    readonly growth_ticks?: number
    readonly autoplace?: { readonly control?: string }
    readonly dying_trigger_effect?: RawTriggerEffect | readonly RawTriggerEffect[]
}

export interface RawTechnology extends RawPrototype {
    readonly effects?: LuaList<{ readonly type: string, readonly recipe?: string, readonly change?: number }>
    readonly max_level?: number | "infinite"
}

export interface RawQuality extends RawPrototype {
    readonly next?: string
    readonly next_probability?: number
    readonly chain_probability?: number
}

export interface RawAsteroidSpawn {
    readonly type?: string
    readonly asteroid: string
}

export interface RawSpaceLocation extends RawPrototype {
    readonly surface_properties?: Readonly<Record<string, number>>
    readonly entities_require_heating?: boolean
    readonly asteroid_spawn_definitions?: LuaList<RawAsteroidSpawn>
    readonly map_gen_settings?: {
        readonly autoplace_controls?: Readonly<Record<string, unknown>>
        readonly autoplace_settings?: {
            readonly entity?: { readonly settings?: Readonly<Record<string, unknown>> }
            readonly tile?: { readonly settings?: Readonly<Record<string, unknown>> }
        }
    }
}

export interface RawTile extends RawPrototype {
    readonly fluid?: string
}

export interface RawSurfaceProperty extends RawPrototype {
    readonly default_value: number
}

export interface RawUtilitySprites extends RawPrototype {
    readonly clock: { readonly filename: string }
    readonly empty_module_slot: { readonly filename: string }
}

export interface RawUtilityConstants extends RawPrototype {
    readonly default_rocket_lift_weight: number
}

/** Prototypes of one type by name. */
export type RawTable<T extends RawPrototype> = Readonly<Record<string, T>>

/**
 * The parsed data-raw-dump.json: prototype tables by type. Lists the types the converter reads by
 * name. It finds item types such as "ammo" or "tool" through itemTables() in convert.ts.
 */
export interface RawData {
    readonly "item-group": RawTable<RawPrototype>
    readonly item?: RawTable<RawItem>
    readonly "assembling-machine"?: RawTable<RawEntity>
    readonly furnace?: RawTable<RawEntity>
    readonly "rocket-silo"?: RawTable<RawEntity>
    readonly "mining-drill"?: RawTable<RawEntity>
    readonly "offshore-pump"?: RawTable<RawEntity>
    readonly boiler?: RawTable<RawEntity>
    readonly generator?: RawTable<RawEntity>
    readonly "solar-panel"?: RawTable<RawEntity>
    readonly reactor?: RawTable<RawEntity>
    readonly "fusion-reactor"?: RawTable<RawEntity>
    readonly "fusion-generator"?: RawTable<RawEntity>
    readonly "transport-belt"?: RawTable<RawEntity>
    readonly "agricultural-tower"?: RawTable<RawEntity>
    readonly "item-subgroup": RawTable<RawGroup>
    readonly fluid: RawTable<RawFluid>
    readonly recipe: RawTable<RawRecipe>
    readonly module: RawTable<RawItem>
    readonly beacon: RawTable<RawEntity>
    readonly planet: RawTable<RawSpaceLocation>
    readonly surface: RawTable<RawSpaceLocation>
    readonly "space-location"?: RawTable<RawSpaceLocation>
    readonly "space-connection"?: RawTable<RawSpaceLocation>
    readonly resource: RawTable<RawEntity>
    readonly tile: RawTable<RawTile>
    readonly plant: RawTable<RawEntity>
    readonly asteroid?: RawTable<RawEntity>
    readonly "asteroid-chunk"?: RawTable<RawPrototype>
    readonly technology?: RawTable<RawTechnology>
    readonly quality?: RawTable<RawQuality>
    readonly "surface-property": RawTable<RawSurfaceProperty>
    readonly "utility-sprites": RawTable<RawUtilitySprites>
    readonly "utility-constants": RawTable<RawUtilityConstants>
}

/** The locale files from --dump-prototype-locale, keyed by prototype kind such as "item". */
export type LocaleFiles = Readonly<Record<string, { readonly names?: Readonly<Record<string, string>> }>>

/** Effects of a module at one quality, as the helper mod reads them in the running game. */
export type RuntimeEffect = Readonly<Record<string, number>>

/** Values the game computes at runtime, written by the helper mod in tools/lib/factorio.ts. */
export interface RuntimeData {
    /** Item weights in grams. */
    readonly item_weights: Readonly<Record<string, number>>
    readonly daytime?: Readonly<Record<string, { readonly dusk: number, readonly evening: number, readonly morning: number, readonly dawn: number }>>
    readonly qualities?: Readonly<Record<string, { readonly level: number, readonly default_multiplier?: number }>>
    readonly crafting_speeds?: Readonly<Record<string, Readonly<Record<string, number>>>>
    readonly max_energy_usage?: Readonly<Record<string, Readonly<Record<string, number>>>>
    readonly module_effects?: Readonly<Record<string, Readonly<Record<string, RuntimeEffect>>>>
}

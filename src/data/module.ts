/*Copyright 2015-2024 Kirk McDonald

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
import { sorted } from "../core/sort.ts"
import type { IconSource } from "./icon-source.ts"
import type { Building, BuildingContext } from "./building.ts"
import type { Quality, QualityContext } from "./quality.ts"
import type { Dataset } from "./dataset.ts"
import type { Item } from "./item.ts"
import { requireItem, type Recipe } from "./recipe.ts"

const minimumPower = Rational.from_floats(1, 5)

/** A module item with the effects the calculator models: speed, productivity and power. */
export class Module implements IconSource {
    readonly key: string
    readonly name: string
    readonly category: string
    readonly order: string
    readonly productivity: Rational
    readonly speed: Rational

    /** Change of power consumption, such as -0.3 for -30%. */
    readonly power: Rational

    // Effects by quality key. Missing qualities use the normal effects.
    private readonly effectsByQuality: ReadonlyMap<string, ModuleEffect>

    readonly icon_col: number
    readonly icon_row: number
    private short: string

    constructor(item: Item, category: string, productivity: Rational, speed: Rational, power: Rational, effectsByQuality: ReadonlyMap<string, ModuleEffect> = new Map()) {
        this.key = item.key
        this.name = item.name
        this.category = category
        this.order = item.order
        this.productivity = productivity
        this.speed = speed
        this.power = power
        this.effectsByQuality = effectsByQuality
        this.icon_col = item.icon_col
        this.icon_row = item.icon_row

        // First and last letter of the key, such as "s3" for speed-module-3.
        this.short = this.key.charAt(0) + this.key.charAt(this.key.length - 1)
    }

    /** Returns the effects of the module at quality. */
    effectAt(quality: Quality): ModuleEffect {
        return this.effectsByQuality.get(quality.key) ?? { productivity: this.productivity, speed: this.speed, power: this.power }
    }

    /** Returns the short name used in URLs. */
    shortName(): string {
        return this.short
    }

    /** Makes the full key the short name. Used when two modules share a short name. */
    useKeyAsShortName(): void {
        this.short = this.key
    }

    /** Returns whether the module may be used for recipe. Productivity modules need recipes that allow it. */
    canUse(recipe: Recipe): boolean {
        return !this.hasProdEffect() || recipe.allow_productivity
    }

    /** Returns whether the module may go into a beacon. */
    canBeacon(): boolean {
        return this.productivity.isZero()
    }

    /** Returns whether the module has a productivity effect. */
    hasProdEffect(): boolean {
        return !this.productivity.isZero()
    }
}

/** Settings a ModuleSpec takes its defaults from. FactorySpecification implements it. */
export interface ModuleDefaults {
    readonly defaultBeacon: readonly [Module | null, Module | null]
    readonly defaultBeaconCount: Rational
    getDefaultModule(recipe: Recipe): Module | null
}

/** The effects of one module at one quality. */
export interface ModuleEffect {
    readonly productivity: Rational
    readonly speed: Rational

    /** Change of power consumption, such as -0.3 for -30%. */
    readonly power: Rational
}

/** The modules and beacons configured for one recipe. */
export class ModuleSpec {
    readonly recipe: Recipe
    building: Building | null = null

    /** One entry per module slot of the building. null is an empty slot. */
    readonly modules: (Module | null)[] = []

    /** The modules in the two slots of each beacon. */
    readonly beaconModules: [Module | null, Module | null]

    /** Number of beacons affecting each building. May be fractional. */
    beaconCount: Rational

    constructor(recipe: Recipe, defaults: ModuleDefaults) {
        this.recipe = recipe
        this.beaconModules = [defaults.defaultBeacon[0], defaults.defaultBeacon[1]]
        this.beaconCount = defaults.defaultBeaconCount
    }

    /** Sets the building and resizes the module list to its slot count, filling new slots with the default module. */
    setBuilding(building: Building, defaults: ModuleDefaults): void {
        this.building = building

        if (this.modules.length > building.moduleSlots) {
            this.modules.length = building.moduleSlots
        }

        const toAdd = defaults.getDefaultModule(this.recipe)

        while (this.modules.length < building.moduleSlots) {
            this.modules.push(toAdd)
        }
    }

    /** Returns the module in slot index, null for an empty slot, or undefined if the slot does not exist. */
    getModule(index: number): Module | null | undefined {
        return this.modules[index]
    }

    /** Puts module into slot index. Returns true if the change requires a new solution, which is the case for productivity changes. */
    setModule(index: number, module: Module | null): boolean {
        if (index >= this.modules.length) {
            return false
        }

        const oldModule = this.modules[index]
        const needRecalc = (oldModule?.hasProdEffect() ?? false) || (module?.hasProdEffect() ?? false)
        this.modules[index] = module

        return needRecalc
    }

    /** Puts module into beacon slot i, which is 0 or 1. */
    setBeaconModule(module: Module | null, i: 0 | 1): void {
        this.beaconModules[i] = module
    }

    /** Sets the number of beacons affecting each building. */
    setBeaconCount(count: Rational): void {
        this.beaconCount = count
    }

    /** Returns the total transmission strength of all beacons affecting one building, for beacons of the given quality. */
    beaconMultiplier(beaconQuality: Quality): Rational {
        if (this.beaconCount.isZero()) {
            return zero
        }

        const i = Math.min(this.beaconCount.ceil().toFloat(), beaconProfile.length) - 1
        const profile = beaconProfile[i]

        if (profile === undefined) {
            throw new Error("beacon profile not loaded")
        }

        const effectivity = beaconEffect.add(beaconBonusPerLevel.mul(Rational.from_float(beaconQuality.level)))
        return this.beaconCount.mul(effectivity).mul(profile)
    }

    // Sums one effect over the building's modules and, if the building has module slots, the beacons.
    private sumEffect(context: QualityContext, effect: (e: ModuleEffect) => Rational): Rational {
        let total = one
        for (const module of this.modules) {
            if (module) {
                total = total.add(effect(module.effectAt(context.moduleQuality)))
            }
        }

        if (this.modules.length > 0) {
            const multiplier = this.beaconMultiplier(context.beaconQuality)
            for (const module of this.beaconModules) {
                if (module) {
                    total = total.add(effect(module.effectAt(context.moduleQuality)).mul(multiplier))
                }
            }
        }

        return total
    }

    /** Returns the speed multiplier, such as 1.5 for +50%. */
    speedEffect(context: QualityContext): Rational {
        return this.sumEffect(context, e => e.speed)
    }

    /** Returns the productivity multiplier of modules and building, such as 1.5 for +50%. */
    prodEffect(context: BuildingContext): Rational {
        let prod = one
        for (const module of this.modules) {
            if (module) {
                prod = prod.add(module.effectAt(context.moduleQuality).productivity)
            }
        }
        if (this.building) {
            prod = prod.add(this.building.prodEffect(context))
        }
        return prod
    }

    /** Returns the power multiplier. The game limits it to at least 0.2. */
    powerEffect(context: QualityContext): Rational {
        const power = this.sumEffect(context, e => e.power)
        return power.less(minimumPower) ? minimumPower : power
    }
}

/** Module rows for module selectors: first a row with only null (no module), then one row per module category. */
export const moduleRows: (Module | null)[][] = []

/** Modules by short name, as used in URLs. */
export const shortModules: Map<string, Module> = new Map()

let beaconProfile: Rational[] = []
let beaconEffect: Rational = one
let beaconBonusPerLevel: Rational = zero

/** Creates all modules by item key, and fills moduleRows, shortModules and the beacon settings. */
export function getModules(data: Dataset, items: ReadonlyMap<string, Item>): Map<string, Module> {
    const modules = new Map<string, Module>()

    for (const d of data.modules) {
        const item = requireItem(items, d.item_key)
        const R = (x: number | undefined): Rational => Rational.from_float_approximate(x ?? 0)
        const byQuality = new Map(Object.entries(d.effect_by_quality ?? {}).map(([q, e]) => [q, { productivity: R(e.productivity), speed: R(e.speed), power: R(e.consumption) }]))
        modules.set(d.item_key, new Module(item, d.category, R(d.effect.productivity), R(d.effect.speed), R(d.effect.consumption), byQuality))
    }

    moduleRows.length = 0
    moduleRows.push([null])
    shortModules.clear()

    let category: string | null = null
    let row: (Module | null)[] = []
    for (const module of sorted(modules.values(), m => m.order)) {
        if (module.category !== category) {
            category = module.category
            row = []
            moduleRows.push(row)
        }
        row.push(module)
        if (shortModules.has(module.shortName())) {
            module.useKeyAsShortName()
        }
        shortModules.set(module.shortName(), module)
    }

    beaconEffect = Rational.from_float_approximate(data.beacon.distribution_effectivity)
    beaconBonusPerLevel = Rational.from_float_approximate(data.beacon.distribution_effectivity_bonus_per_quality_level ?? 0)
    beaconProfile = data.beacon.profile.map(x => Rational.from_float_approximate(x))

    return modules
}

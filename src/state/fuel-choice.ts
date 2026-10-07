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

// The fuel that burner buildings use, chosen per fuel category.

import type { Fuel } from "../data/fuel.ts"

const DEFAULT_FUEL = "coal"

/** The fuels of the dataset and the fuel chosen for each fuel category. */
export class FuelChoice {
    fuels: ReadonlyMap<string, Fuel> = new Map()
    /** Fuel category to the chosen fuel. Categories without an entry use their default fuel. */
    readonly selected: Map<string, Fuel> = new Map()

    /** Replaces the fuels with those of a loaded dataset and clears the choices. */
    setFuels(fuels: ReadonlyMap<string, Fuel>): void {
        this.fuels = fuels
        this.selected.clear()
    }

    /** Returns the fuels of a fuel category, from lowest to highest fuel value. */
    fuelsOf(category: string): Fuel[] {
        return Array.from(this.fuels.values()).filter(f => f.categories.has(category))
    }

    /** Returns the default fuel of category: DEFAULT_FUEL if it belongs to it, otherwise the one with the lowest fuel value. */
    getDefault(category: string): Fuel {
        const fuels = this.fuelsOf(category)
        const fuel = fuels.find(f => f.key === DEFAULT_FUEL) ?? fuels[0]
        if (fuel === undefined) {
            throw new Error(`no fuel of category ${category}`)
        }
        return fuel
    }

    /** Returns the fuel that buildings of a fuel category burn. */
    get(category: string): Fuel {
        return this.selected.get(category) ?? this.getDefault(category)
    }
}

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

// Quality levels. Quality raises the crafting speed of machines, the positive effects of modules
// and the distribution effectivity of beacons.
import type { Dataset } from "./dataset.ts"
import type { IconSource } from "./icon-source.ts"
import type { Recipe } from "./recipe.ts"

/** A quality level such as uncommon. */
export class Quality implements IconSource {
    readonly key: string
    readonly name: string
    readonly level: number
    readonly icon_col: number
    readonly icon_row: number

    constructor(key: string, name: string, level: number, col: number, row: number) {
        this.key = key
        this.name = name
        this.level = level
        this.icon_col = col
        this.icon_row = row
    }
}

/** What a quality setting applies to: the machines of a recipe, their modules, or the beacons around them. */
export type QualityKind = "machine" | "module" | "beacon"

/** The quality kinds in the order the settings show them. */
export const QUALITY_KINDS: readonly QualityKind[] = ["machine", "module", "beacon"]

/** Provides the quality of machines, modules and beacons per recipe. */
export interface QualityContext {
    /** Returns the quality of the given kind for recipe. */
    getQuality(recipe: Recipe, kind: QualityKind): Quality
}

/** Creates the quality levels from lowest to highest. */
export function getQualities(data: Dataset): Quality[] {
    return data.qualities.map(d => new Quality(d.key, d.localized_name.en, d.level, d.icon_col, d.icon_row))
}

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
import { Rational, zero } from "../core/rational.ts"
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
    /** The quality a raise leads to, or null for the highest quality. */
    next: Quality | null = null
    /** Chance of a raise per 100% quality effect. */
    readonly nextProbability: Rational
    /** Chance of one more raise after a raise reached this quality. */
    readonly chainProbability: Rational

    constructor(key: string, name: string, level: number, col: number, row: number, nextProbability: Rational = zero, chainProbability: Rational = zero) {
        this.key = key
        this.name = name
        this.level = level
        this.icon_col = col
        this.icon_row = row
        this.nextProbability = nextProbability
        this.chainProbability = chainProbability
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

/** Creates the quality levels from lowest to highest, linked to their next quality. */
export function getQualities(data: Dataset): Quality[] {
    const R = (x: number): Rational => Rational.from_float_approximate(x)
    const qualities = data.qualities.map(d => new Quality(d.key, d.localized_name.en, d.level, d.icon_col, d.icon_row, R(d.next_probability), R(d.chain_probability)))
    data.qualities.forEach((d, i) => {
        const quality = qualities[i]
        if (quality !== undefined && d.next !== undefined) {
            quality.next = qualities.find(q => q.key === d.next) ?? null
        }
    })
    return qualities
}

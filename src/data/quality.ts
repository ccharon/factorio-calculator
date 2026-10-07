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
import { Rational, zero, one } from "../core/rational.ts"
import type { Dataset } from "./dataset.ts"
import type { IconSource } from "./icon-source.ts"
import type { Item } from "./item.ts"
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

/**
 * Returns the share of each product quality when a machine with the given quality effect crafts from
 * ingredients of quality from. A raise happens with chance effect × nextProbability, and each raise
 * reaches one quality further with the chainProbability of the quality it reached.
 *
 * @param effect - Total quality effect of modules and beacons, such as 0.1 for +10%. Values of zero or less raise nothing.
 */
export function qualityDistribution(from: Quality, effect: Rational): Map<Quality, Rational> {
    const raise = from.next === null || !zero.less(effect) ? zero : effect.mul(from.nextProbability)
    const raised = one.less(raise) ? one : raise

    const shares = new Map<Quality, Rational>([[from, one.sub(raised)]])
    let remaining = raised
    for (let quality = from.next; quality !== null && !remaining.isZero(); quality = quality.next) {
        const further = quality.next === null ? zero : quality.chainProbability
        shares.set(quality, remaining.mul(one.sub(further)))
        remaining = remaining.mul(further)
    }
    return shares
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

/**
 * Creates the variants of higher qualities: of every solid item that is not in orbit, and of every
 * recipe with quality variants and a solid ingredient.
 */
export function addQualityVariants(items: Iterable<Item>, recipes: Iterable<Recipe>, qualities: readonly Quality[]): void {
    const higher = qualities.slice(1)
    for (const item of items) {
        if (item.phase === "solid" && item.ground === null) {
            for (const quality of higher) {
                item.addVariant(quality)
            }
        }
    }
    for (const recipe of recipes) {
        if (recipe.qualityVariants && recipe.ingredients.some(ing => ing.item.variants.size > 0)) {
            for (const quality of higher) {
                recipe.addVariant(quality)
            }
        }
    }
}

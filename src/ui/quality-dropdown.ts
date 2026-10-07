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

// The quality dropdown of a factory table row: the quality of the recipe's machines, modules and
// beacons.

import type * as d3 from "d3"
import type { Quality, QualityKind } from "../data/quality.ts"
import type { Recipe } from "../data/recipe.ts"
import { spec } from "../state/factory.ts"
import { addInputs, makeDropdown } from "./dropdown.ts"
import { iconOf } from "./icons.ts"

const KIND_LABELS: ReadonlyMap<QualityKind, string> = new Map([
    ["machine", "Machines"],
    ["module", "Modules"],
    ["beacon", "Beacons"],
])

/** One radio group of the dropdown: the quality of one kind for a recipe. */
interface QualityGroup {
    readonly recipe: Recipe
    readonly kind: QualityKind
    /** Radio group name, unique on the page. */
    readonly name: string
}

/** One choice in a radio group. */
interface QualityChoice {
    readonly group: QualityGroup
    readonly quality: Quality
}

let groupCount = 0

/**
 * Appends a quality dropdown to each element of selector. It shows the current qualities and changes
 * them for the recipe.
 *
 * @param recipeOf - Returns the recipe of an element's datum.
 * @param kindsOf - Returns the quality kinds that matter for the datum's recipe.
 * @param onChange - Called after a quality changed.
 */
export function qualityDropdown<GElement extends HTMLElement, Datum, PElement extends d3.BaseType, PDatum>(
    selector: d3.Selection<GElement, Datum, PElement, PDatum>,
    recipeOf: (d: Datum) => Recipe,
    kindsOf: (d: Datum) => readonly QualityKind[],
    onChange: () => void,
): void {
    const dropdown = makeDropdown(selector).classed("quality-dropdown", true)
    const groups = dropdown.selectAll<HTMLDivElement, QualityGroup>("div.quality-group")
        .data(d => kindsOf(d).map(kind => ({ recipe: recipeOf(d), kind, name: `quality-${groupCount++}` })))
        .join("div")
        .classed("quality-group", true)
    groups.append("span").classed("quality-kind", true).text(group => KIND_LABELS.get(group.kind) ?? group.kind)

    const choices = groups.selectAll<HTMLSpanElement, QualityChoice>("span.input").data(group => spec.qualities.map(quality => ({ group, quality }))).join("span").classed("input", true)
    const labels = addInputs(
        choices,
        choice => choice.group.name,
        choice => spec.getQuality(choice.group.recipe, choice.group.kind) === choice.quality,
        choice => {
            spec.setRecipeQuality(choice.group.recipe, choice.group.kind, choice.quality)
            onChange()
        },
    )
    labels.attr("title", choice => `${KIND_LABELS.get(choice.group.kind) ?? ""}: ${choice.quality.name}`)
    labels.append(choice => iconOf(choice.quality).make(16, true))
}

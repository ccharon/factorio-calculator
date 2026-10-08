// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

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

/** One choice in a radio group of qualities for the datum d. */
interface QualityChoice<Datum> {
    readonly d: Datum
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

    appendQualityChoices(groups, 16, {
        name: group => group.name,
        checked: (group, quality) => spec.getQuality(group.recipe, group.kind) === quality,
        choose: (group, quality) => {
            spec.setRecipeQuality(group.recipe, group.kind, quality)
            onChange()
        },
        title: (group, quality) => `${KIND_LABELS.get(group.kind) ?? ""}: ${quality.name}`,
    })
}

/** How a radio group of qualities reads and changes its value. */
export interface QualityChoices<Datum> {
    /** Radio group name, unique on the page. */
    name(d: Datum): string
    checked(d: Datum, quality: Quality): boolean
    choose(d: Datum, quality: Quality): void
    title(d: Datum, quality: Quality): string
}

/** Appends a radio group of all qualities with their icons of size pixels to each element of selector. */
export function appendQualityChoices<GElement extends HTMLElement, Datum, PElement extends d3.BaseType, PDatum>(
    selector: d3.Selection<GElement, Datum, PElement, PDatum>,
    size: number,
    choices: QualityChoices<Datum>,
): void {
    const inputs = selector.selectAll<HTMLSpanElement, QualityChoice<Datum>>("span.input").data(d => spec.qualities.map(quality => ({ d, quality }))).join("span").classed("input", true)
    const labels = addInputs(inputs, c => choices.name(c.d), c => choices.checked(c.d, c.quality), c => choices.choose(c.d, c.quality))
    labels.attr("title", c => choices.title(c.d, c.quality)).append(c => iconOf(c.quality).make(size, true))
}

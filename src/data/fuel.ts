// SPDX-FileCopyrightText: 2015-2024 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import { Rational } from "../core/rational.ts"
import type { IconSource } from "./icon-source.ts"
import type { Dataset } from "./dataset.ts"
import type { Item } from "./item.ts"
import { requireItem } from "./recipe.ts"

/** An item that burner machines can burn, with its fuel value. */
export class Fuel implements IconSource {
    readonly key: string
    readonly name: string
    readonly item: Item
    readonly categories: ReadonlySet<string>
    /** Energy per item in J. */
    readonly value: Rational
    readonly icon_col: number
    readonly icon_row: number

    constructor(item: Item, categories: Iterable<string>, value: Rational) {
        this.key = item.key
        this.name = item.name
        this.item = item
        this.categories = new Set(categories)
        this.value = value
        this.icon_col = item.icon_col
        this.icon_row = item.icon_row
    }
}

/** Creates all fuels by key, from lowest to highest fuel value. */
export function getFuel(data: Dataset, items: ReadonlyMap<string, Item>): Map<string, Fuel> {
    const fuels = data.fuel.map(d => new Fuel(requireItem(items, d.item_key), d.categories, Rational.from_float_approximate(d.value)))
    fuels.sort((a, b) => (a.value.less(b.value) ? -1 : b.value.less(a.value) ? 1 : 0))
    return new Map(fuels.map(f => [f.key, f]))
}

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

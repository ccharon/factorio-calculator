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
import * as d3 from "d3"
import { Rational } from "../core/rational.ts"
import { energyString } from "../ui/energy.ts"
import { Icon, type IconSource } from "../ui/icon.ts"
import type { Dataset } from "./dataset.ts"
import type { Item } from "./item.ts"
import { requireItem } from "./recipe.ts"

/** An item that burner machines can burn, with its fuel value. */
export class Fuel implements IconSource {
    readonly key: string
    readonly name: string
    readonly item: Item
    readonly category: string
    /** Energy per item in J. */
    readonly value: Rational
    readonly icon_col: number
    readonly icon_row: number
    readonly icon: Icon

    constructor(item: Item, category: string, value: Rational) {
        this.key = item.key
        this.name = item.name
        this.item = item
        this.category = category
        this.value = value
        this.icon_col = item.icon_col
        this.icon_row = item.icon_row
        this.icon = new Icon(this)
    }

    /** Returns the fuel value such as "4 MJ". */
    valueString(): string {
        return energyString(this.value)
    }

    /** Returns a tooltip element with the fuel value. */
    renderTooltip(): HTMLDivElement {
        const t = d3.create("div").classed("frame", true)
        const header = t.append("h3")
        header.append(() => this.icon.make(32, true))
        header.node()?.append(this.name)
        t.append("b").text("Energy: ")
        t.node()?.append(this.valueString())
        return t.node() as HTMLDivElement
    }
}

/** Creates the chemical fuels by key, from lowest to highest fuel value. */
export function getFuel(data: Dataset, items: ReadonlyMap<string, Item>): Map<string, Fuel> {
    const chemical = data.fuel.filter(d => d.category === "chemical")
    const fuels = chemical.map(d => new Fuel(requireItem(items, d.item_key), d.category, Rational.from_float_approximate(d.value)))
    fuels.sort((a, b) => (a.value.less(b.value) ? -1 : b.value.less(a.value) ? 1 : 0))
    return new Map(fuels.map(f => [f.key, f]))
}

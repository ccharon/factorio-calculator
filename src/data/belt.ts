/*Copyright 2019-2021 Kirk McDonald

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
import { spec } from "../state/factory.js"
import { Icon, type IconSource } from "../ui/icon.ts"
import type { Dataset } from "./dataset.ts"

// Tiles per tick to items per second: 60 ticks, 2 lanes, and 4 items per lane and tile.
const itemsPerSecondPerSpeed = Rational.from_float(480)

/** A transport belt with its throughput. */
export class Belt implements IconSource {
    readonly key: string
    readonly name: string
    /** Items per second on both lanes. */
    readonly rate: Rational
    readonly icon_col: number
    readonly icon_row: number
    readonly icon: Icon

    constructor(key: string, name: string, col: number, row: number, rate: Rational) {
        this.key = key
        this.name = name
        this.rate = rate
        this.icon_col = col
        this.icon_row = row
        this.icon = new Icon(this)
    }

    /** Returns a tooltip element with the throughput. */
    renderTooltip(): HTMLDivElement {
        const t = d3.create("div")
            .classed("frame", true)
        const header = t.append("h3")
        header.append(() => this.icon.make(32, true))
        header.node()?.append(this.name)
        t.append("b")
            .text("Max throughput: ")
        t.node()?.append(`${spec.format.rate(this.rate)}/${spec.format.longRate}`)
        return t.node() as HTMLDivElement
    }
}

/** Creates all belts by key, from slowest to fastest. */
export function getBelts(data: Dataset): Map<string, Belt> {
    const belts = data.belts.map(d => new Belt(
        d.key,
        d.localized_name.en,
        d.icon_col,
        d.icon_row,
        Rational.from_float_approximate(d.speed).mul(itemsPerSecondPerSpeed),
    ))
    belts.sort((a, b) => (a.rate.less(b.rate) ? -1 : b.rate.less(a.rate) ? 1 : 0))
    return new Map(belts.map(b => [b.key, b]))
}

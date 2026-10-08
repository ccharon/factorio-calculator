// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import { Rational } from "../core/rational.ts"
import type { Dataset } from "./dataset.ts"
import type { IconSource } from "./icon-source.ts"

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

    constructor(key: string, name: string, col: number, row: number, rate: Rational) {
        this.key = key
        this.name = name
        this.rate = rate
        this.icon_col = col
        this.icon_row = row
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

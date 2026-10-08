// SPDX-FileCopyrightText: 2019-2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import { Rational } from "../core/rational.ts"
import type { Dataset } from "./dataset.ts"
import { TICKS_PER_SECOND } from "./game.ts"
import type { IconSource } from "./icon-source.ts"

// Tiles per tick to items per second: ticks per second, 2 lanes, and 4 items per lane and tile.
const itemsPerSecondPerSpeed = Rational.from_integer(TICKS_PER_SECOND * 2 * 4)

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
    belts.sort((a, b) => a.rate.compare(b.rate))
    return new Map(belts.map(b => [b.key, b]))
}

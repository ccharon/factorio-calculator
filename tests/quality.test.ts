// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Tests of the quality distribution in src/data/quality.ts.

import assert from "node:assert/strict"
import { test } from "vitest"
import { Rational, zero } from "../src/core/rational.ts"
import { Quality, qualityDistribution } from "../src/data/quality.ts"

const r = (s: string): Rational => Rational.from_string(s)

// The qualities of 2.1: every raise has next_probability 1, every further raise chain_probability 0.1.
function qualities(): Quality[] {
    const keys = ["normal", "uncommon", "rare", "epic", "legendary"]
    const list = keys.map((key, i) => new Quality(key, key, i, 0, 0, i < 4 ? r("1") : zero, i < 4 ? r("1/10") : zero))
    list.forEach((q, i) => { q.next = list[i + 1] ?? null })
    return list
}

function shares(distribution: Map<Quality, Rational>): Record<string, string> {
    return Object.fromEntries(Array.from(distribution, ([q, share]) => [q.key, share.toString()]))
}

// Returns the quality at index i of the 2.1 qualities.
function quality(i: number): Quality {
    const q = qualities()[i]
    if (q === undefined) {
        throw new Error(`no quality ${i}`)
    }
    return q
}

test("qualityDistribution chains raises with chain_probability", () => {
    const normal = quality(0)
    assert.deepEqual(shares(qualityDistribution(normal, r("1/10"))), {
        normal: "9/10", uncommon: "9/100", rare: "9/1000", epic: "9/10000", legendary: "1/10000",
    })
})

test("qualityDistribution keeps the quality without a positive effect", () => {
    const normal = quality(0)
    assert.deepEqual(shares(qualityDistribution(normal, zero)), { normal: "1" })
    assert.deepEqual(shares(qualityDistribution(normal, r("-1/100"))), { normal: "1" })
})

test("qualityDistribution starts at the ingredient quality and ends at the highest", () => {
    assert.deepEqual(shares(qualityDistribution(quality(3), r("1/4"))), { epic: "3/4", legendary: "1/4" })
    assert.deepEqual(shares(qualityDistribution(quality(4), r("1/4"))), { legendary: "1" })
})

test("qualityDistribution limits the raise chance to 1", () => {
    assert.deepEqual(shares(qualityDistribution(quality(3), r("3"))), { epic: "0", legendary: "1" })
})

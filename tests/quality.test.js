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

import assert from "node:assert/strict"
import { test } from "vitest"
import { Rational, zero } from "../src/core/rational.ts"
import { Quality, qualityDistribution } from "../src/data/quality.ts"

const r = s => Rational.from_string(s)

// The qualities of 2.1: every raise has next_probability 1, every further raise chain_probability 0.1.
function qualities() {
    const keys = ["normal", "uncommon", "rare", "epic", "legendary"]
    const list = keys.map((key, i) => new Quality(key, key, i, 0, 0, i < 4 ? r("1") : zero, i < 4 ? r("1/10") : zero))
    list.forEach((q, i) => { q.next = list[i + 1] ?? null })
    return list
}

function shares(distribution) {
    return Object.fromEntries(Array.from(distribution, ([q, share]) => [q.key, share.toString()]))
}

test("qualityDistribution chains raises with chain_probability", () => {
    const [normal] = qualities()
    assert.deepEqual(shares(qualityDistribution(normal, r("1/10"))), {
        normal: "9/10", uncommon: "9/100", rare: "9/1000", epic: "9/10000", legendary: "1/10000",
    })
})

test("qualityDistribution keeps the quality without a positive effect", () => {
    const [normal] = qualities()
    assert.deepEqual(shares(qualityDistribution(normal, zero)), { normal: "1" })
    assert.deepEqual(shares(qualityDistribution(normal, r("-1/100"))), { normal: "1" })
})

test("qualityDistribution starts at the ingredient quality and ends at the highest", () => {
    const list = qualities()
    assert.deepEqual(shares(qualityDistribution(list[3], r("1/4"))), { epic: "3/4", legendary: "1/4" })
    assert.deepEqual(shares(qualityDistribution(list[4], r("1/4"))), { legendary: "1" })
})

test("qualityDistribution limits the raise chance to 1", () => {
    const list = qualities()
    assert.deepEqual(shares(qualityDistribution(list[3], r("3"))), { epic: "0", legendary: "1" })
})

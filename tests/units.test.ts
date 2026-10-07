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
import { parseEnergy, roundFloat } from "../tools/lib/units.ts"

test("parses power and energy with SI prefixes", () => {
    assert.equal(parseEnergy("75kW", "W"), 75000)
    assert.equal(parseEnergy("1.8MW", "W"), 1800000)
    assert.equal(parseEnergy("4MJ", "J"), 4000000)
    assert.equal(parseEnergy("0.2kJ", "J"), 200)
    assert.equal(parseEnergy("500W", "W"), 500)
})

test("passes numbers and undefined through", () => {
    assert.equal(parseEnergy(42, "W"), 42)
    assert.equal(parseEnergy(undefined, "W"), undefined)
})

test("rejects wrong units and garbage", () => {
    assert.throws(() => parseEnergy("4MJ", "W"))
    assert.throws(() => parseEnergy("fast", "W"))
})

test("roundFloat removes binary noise", () => {
    assert.equal(roundFloat(0.1 + 0.2), 0.3)
    assert.equal(roundFloat(0.007000000000000001), 0.007)
})

import assert from "node:assert/strict"
import { test } from "node:test"
import { parseEnergy, roundFloat } from "../tools/lib/units.js"

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

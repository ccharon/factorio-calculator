// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict"
import { test } from "vitest"
import { Rational } from "../src/core/rational.ts"
import { reactorNeighbours } from "../src/state/energy.ts"

test("reactorNeighbours counts the average neighbours in a 2×N block", () => {
    assert.ok(reactorNeighbours(0).isZero())
    assert.ok(reactorNeighbours(1).equal(Rational.from_float(1)))
    assert.ok(reactorNeighbours(2).equal(Rational.from_float(2)))
    assert.ok(reactorNeighbours(4).equal(Rational.from_string("5/2")))
})

// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict"
import { test } from "vitest"
import { makeCurve } from "../src/visualize/circlepath.ts"

test("makeCurve draws steep curves with a stroke width without NaN", () => {
    const path = makeCurve(-1, 0, 100, 0, 0, 500, 20).path()
    assert.ok(!path.includes("NaN"), path)
})

test("makeCurve draws shallow curves as two arcs", () => {
    const path = makeCurve(1, 0, 0, 0, 100, 20).path()
    assert.equal(path.split(" A ").length, 3, path)
})

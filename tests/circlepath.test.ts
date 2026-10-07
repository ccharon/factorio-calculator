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
import { makeCurve } from "../src/visualize/circlepath.ts"

test("makeCurve draws steep curves with a stroke width without NaN", () => {
    const path = makeCurve(-1, 0, 100, 0, 0, 500, 20).path()
    assert.ok(!path.includes("NaN"), path)
})

test("makeCurve draws shallow curves as two arcs", () => {
    const path = makeCurve(1, 0, 0, 0, 100, 20).path()
    assert.equal(path.split(" A ").length, 3, path)
})

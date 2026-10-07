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

// src/data and src/core hold game data and math. They must not depend on the UI, the global state
// or the DOM, so that they stay testable without a browser.
import { readdirSync, readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { test } from "vitest"

const LAYERS = ["data", "core"]
const FORBIDDEN_IMPORT = /from "\.\.\/(ui|state|visualize)\//
const DOM = /\b(document|window|HTMLElement|HTMLDivElement|d3\.(create|select|selectAll))\b/

for (const layer of LAYERS) {
    const dir = new URL(`../src/${layer}/`, import.meta.url)
    for (const file of readdirSync(dir).filter(f => f.endsWith(".ts"))) {
        test(`src/${layer}/${file} imports no UI or state and uses no DOM`, () => {
            const lines = readFileSync(new URL(file, dir), "utf8").split("\n")
            const bad = lines.map((line, i): [number, string] => [i + 1, line]).filter(([, line]) => FORBIDDEN_IMPORT.test(line) || DOM.test(line))
            assert.deepEqual(bad, [])
        })
    }
}

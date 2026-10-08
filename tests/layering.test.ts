// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

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

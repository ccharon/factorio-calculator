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

// Records or checks the factory snapshot: the solver result of every scenario in
// tests/snapshots/scenarios.js, read from window.spec in headless Chrome.
// All numbers are exact rationals as strings, so any change in a result shows up.
//
// Usage: node tests/browser/snapshot.js record|check [--dist]

import { readFileSync, writeFileSync } from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { SCENARIOS } from "../snapshots/scenarios.js"
import { openCalculator, startBrowser } from "./browser.js"

const SNAPSHOT = new URL("../snapshots/factory.json", import.meta.url)
const mode = process.argv[2]
if (mode !== "record" && mode !== "check") {
    console.error("usage: snapshot.js record|check [--dist]")
    process.exit(2)
}

// Runs inside the page. Sorted by key so the output does not depend on Map order.
function readSolution() {
    const spec = window.spec
    const totals = spec.lastTotals
    const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    const recipes = [...totals.rates].map(([recipe, rate]) => {
        const building = spec.getBuilding(recipe)
        const { fuel, power } = spec.getPowerUsage(recipe, rate)
        return {
            // The solver's output and surplus nodes have a name but no key.
            key: recipe.key ?? `(${recipe.name})`,
            rate: rate.toString(),
            building: building ? building.key : null,
            count: spec.getCount(recipe, rate).toString(),
            fuel,
            power: power.toString(),
        }
    }).sort(byKey)
    const items = [...totals.items].map(([item, rate]) => ({ key: item.key, rate: rate.toString() })).sort(byKey)
    const surplus = [...totals.surplus].map(([item, rate]) => ({ key: item.key, rate: rate.toString() })).sort(byKey)
    return { recipes, items, surplus }
}

// Lists the first entries that differ, by list and key, such as "recipes iron-plate".
function describeDifference(expected, actual) {
    if (expected === undefined || actual === undefined) {
        return expected === undefined ? " (new scenario)" : " (missing scenario)"
    }
    const differences = []
    for (const list of ["recipes", "items", "surplus"]) {
        const before = new Map(expected[list].map(entry => [entry.key, entry]))
        const after = new Map(actual[list].map(entry => [entry.key, entry]))
        for (const key of new Set([...before.keys(), ...after.keys()])) {
            if (!isDeepStrictEqual(before.get(key), after.get(key))) {
                differences.push(`${list} ${key}`)
            }
        }
    }
    const shown = differences.slice(0, 5).join(", ")
    return differences.length > 5 ? `: ${shown} and ${differences.length - 5} more` : `: ${shown}`
}

const { base, browser, close } = await startBrowser({ dist: process.argv.includes("--dist") })
const results = {}
const errors = []
try {
    for (const [name, fragment] of SCENARIOS) {
        const { page, errors: pageErrors } = await openCalculator(browser, base, fragment)
        errors.push(...pageErrors.map(e => `${name}: ${e}`))
        results[name] = { fragment, ...await page.evaluate(readSolution) }
        await page.close()
    }
} finally {
    await close()
}

if (mode === "record") {
    writeFileSync(SNAPSHOT, JSON.stringify(results, null, 2) + "\n")
    console.log(`recorded ${Object.keys(results).length} scenarios`)
} else {
    const expected = JSON.parse(readFileSync(SNAPSHOT, "utf8"))
    for (const name of new Set([...Object.keys(expected), ...Object.keys(results)])) {
        if (!isDeepStrictEqual(expected[name], results[name])) {
            errors.push(`${name}: result differs from snapshot${describeDifference(expected[name], results[name])}`)
        }
    }
    console.log(`checked ${Object.keys(results).length} scenarios`)
}
if (errors.length > 0) {
    console.log(errors.join("\n"))
    process.exitCode = 1
}

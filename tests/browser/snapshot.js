// Records or checks the factory snapshot: the solver result of every scenario in
// tests/snapshots/scenarios.js, read from window.spec in headless Chrome.
// All numbers are exact rationals as strings, so any change in a result shows up.
//
// Usage: node tests/browser/snapshot.js record|check [base-url]

import { readFileSync, writeFileSync } from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { SCENARIOS } from "../snapshots/scenarios.js"
import { openCalculator, startBrowser } from "./browser.js"

const SNAPSHOT = new URL("../snapshots/factory.json", import.meta.url)
const mode = process.argv[2]
if (mode !== "record" && mode !== "check") {
    console.error("usage: snapshot.js record|check [base-url]")
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

const { base, browser, close } = await startBrowser(process.argv[3])
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
            errors.push(`${name}: result differs from snapshot`)
        }
    }
    console.log(`checked ${Object.keys(results).length} scenarios`)
}
if (errors.length > 0) {
    console.log(errors.join("\n"))
    process.exitCode = 1
}

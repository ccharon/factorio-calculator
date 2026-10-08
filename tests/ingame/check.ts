// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Builds the factories of tests/ingame/factories.ts in the local game, runs them headless, and
// compares what they produced with the calculator's results for the same settings. Runs manually
// after changes to the calculations; it is not part of npm run check.
//
// Usage: node tests/ingame/check.ts --factorio <dir> [--keep]
//   --factorio  Factorio installation (or set FACTORIO_DIR).
//   --keep      Keep the temporary game directory and print its path.

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import type { Browser } from "puppeteer-core"
import { TICKS_PER_SECOND } from "../../src/data/game.ts"
import { HeadlessGame } from "../../tools/lib/factorio.ts"
import { openCalculator, startBrowser } from "../browser/browser.ts"
import { FACTORIES, type Factory } from "./factories.ts"

// Ticks before the measuring window, so that machines run at full speed and buffers are full.
const WARMUP_TICKS = 600
const WINDOW_TICKS = 36000
const WINDOW_SECONDS = WINDOW_TICKS / TICKS_PER_SECOND

// A window can cut one craft at each end, and a craft with productivity can finish up to two products.
const PRODUCT_TOLERANCE = 3
// The machine's own energy buffer makes the fuel energy differ slightly.
const ENERGY_TOLERANCE = 0.005

/** What one factory produced and burned in the game during the measuring window. */
interface Measured {
    readonly products: number
    /** Joules taken from the fuel, for burner machines. */
    readonly fuel_energy?: number
}

/** The calculator's result for one factory: products per second and the burner power in W. */
interface Expected {
    readonly fragment: string
    readonly rate: number
    readonly power: number
}

// Runs all factories in one game and returns the measurements by factory name.
function runGame(factorioDir: string, workDir: string): Record<string, Measured> {
    const game = new HeadlessGame(factorioDir, workDir)
    const config = JSON.stringify({ warmup: WARMUP_TICKS, window: WINDOW_TICKS, factories: FACTORIES })
    game.addMod("calculator-ingame-test", {
        "info.json": JSON.stringify({ name: "calculator-ingame-test", version: "1.0.0", title: "Calculator in-game test", author: "factorio-calculator", factorio_version: "2.1", dependencies: ["space-age"] }),
        "control.lua": readFileSync(new URL("mod/control.lua", import.meta.url), "utf8"),
        "factories.lua": `return [==[${config}]==]\n`,
    })
    const map = join(workDir, "ingame.zip")
    game.run("--create", map)
    game.run("--benchmark", map, "--benchmark-ticks", String(WARMUP_TICKS + WINDOW_TICKS + 1))
    // The game writes this file, so it has the shape the mod gives it.
    return JSON.parse(readFileSync(join(game.scriptOutput, "ingame-results.json"), "utf8")) as Record<string, Measured>
}

// Returns the URL fragment that sets up factory in the calculator: one building, its modules and beacons.
function fragmentOf(factory: Factory, groupKey: string): string {
    const settings = [`items=${factory.item}:f:1:${factory.recipe}`, "planet=nauvis", `buildings=${groupKey}:${factory.machine}`]
    if (factory.modules !== undefined || factory.beacons !== undefined) {
        const beacons = factory.beacons === undefined ? "" : `;${factory.beacons.modules.join(":")}:${factory.beacons.count}`
        settings.push(`modules=${factory.recipe}:${(factory.modules ?? []).join(":")}${beacons}`)
    }
    if (factory.fuel !== undefined) {
        settings.push(`fuel=${factory.fuel}`)
    }
    return "#" + settings.join("&")
}

// Computes factory in the calculator.
async function compute(browser: Browser, base: string, factory: Factory): Promise<Expected> {
    // The buildings setting names the building group of the recipe, which only the calculator knows.
    const probe = await openCalculator(browser, base, `#items=${factory.item}:f:1&planet=nauvis`)
    const groupKey = await probe.page.evaluate((recipeKey: string) => {
        const recipe = window.spec.recipes.get(recipeKey)
        return recipe === undefined ? undefined : window.spec.recipeGroups.get(recipe)?.key
    }, factory.recipe)
    await probe.page.close()
    if (groupKey === undefined) {
        throw new Error(`${factory.name}: no building group for ${factory.recipe}`)
    }

    const fragment = fragmentOf(factory, groupKey)
    const { page, errors } = await openCalculator(browser, base, fragment)
    if (errors.length > 0) {
        throw new Error(`${factory.name}: ${errors.join("\n")}`)
    }
    const result = await page.evaluate((recipeKey: string) => {
        const spec = window.spec
        const recipe = spec.recipes.get(recipeKey)
        const target = spec.buildTargets[0]
        const crafts = recipe === undefined ? undefined : spec.lastTotals?.rates.get(recipe)
        if (recipe === undefined || target === undefined || crafts === undefined) {
            return null
        }
        return { rate: target.getRate().toFloat(), power: spec.getPowerUsage(recipe, crafts).power.toFloat() }
    }, factory.recipe)
    await page.close()
    if (result === null) {
        throw new Error(`${factory.name}: the calculator has no result for ${factory.recipe}`)
    }
    return { fragment, ...result }
}

// Returns the lines of the report for one factory and whether it passed.
function compare(factory: Factory, measured: Measured | undefined, expected: Expected): [string[], boolean] {
    if (measured === undefined) {
        return [[`${factory.name}: no measurement`], false]
    }
    const lines: string[] = []
    let ok = true

    const products = expected.rate * WINDOW_SECONDS
    const productsOk = Math.abs(measured.products - products) <= PRODUCT_TOLERANCE
    ok &&= productsOk
    lines.push(`  products in ${WINDOW_SECONDS} s: game ${measured.products}, calculator ${products.toFixed(2)} ${productsOk ? "ok" : "DIFFERS"}`)

    if (factory.fuel !== undefined) {
        const energy = expected.power * WINDOW_SECONDS
        const measuredEnergy = measured.fuel_energy ?? 0
        const energyOk = Math.abs(measuredEnergy - energy) <= energy * ENERGY_TOLERANCE
        ok &&= energyOk
        lines.push(`  fuel energy in ${WINDOW_SECONDS} s: game ${measuredEnergy.toFixed(0)} J, calculator ${energy.toFixed(0)} J ${energyOk ? "ok" : "DIFFERS"}`)
    }

    return [[`${factory.name} ${ok ? "ok" : "FAILED"}  ${expected.fragment}`, ...lines], ok]
}

const { values: args } = parseArgs({
    options: {
        factorio: { type: "string", default: process.env["FACTORIO_DIR"] },
        keep: { type: "boolean", default: false },
    },
})
if (!args.factorio) {
    console.error("missing --factorio <dir> or FACTORIO_DIR")
    process.exit(2)
}

const workDir = mkdtempSync(join(tmpdir(), "factorio-ingame-"))
let failed = 0
try {
    const measurements = runGame(args.factorio, workDir)
    const { base, browser, close } = await startBrowser()
    try {
        for (const factory of FACTORIES) {
            const [lines, ok] = compare(factory, measurements[factory.name], await compute(browser, base, factory))
            console.log(lines.join("\n"))
            failed += ok ? 0 : 1
        }
    } finally {
        await close()
    }
} finally {
    if (args.keep) {
        console.log(`game directory kept in ${workDir}`)
    } else {
        rmSync(workDir, { recursive: true, force: true })
    }
}
console.log(`${FACTORIES.length - failed} of ${FACTORIES.length} factories match`)
process.exitCode = failed > 0 ? 1 : 0

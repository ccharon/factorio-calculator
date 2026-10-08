// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Builds the factories of all in-game test modules in the local game, runs them headless in one
// game, and compares what they produced with the calculator's results for the same settings.
// Runs manually after changes to the calculations; it is not part of npm run check.
//
// Usage: node tests/ingame/check.ts --factorio <dir> [--only <text>] [--keep]
//   --factorio  Factorio installation (or set FACTORIO_DIR).
//   --only      Run only the factories whose name contains text.
//   --keep      Keep the temporary game directory and print its path.

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { HeadlessGame } from "../../tools/lib/factorio.ts"
import { startBrowser } from "../browser/browser.ts"
import { Calculator } from "./framework/calculator.ts"
import { type FactoryData, type IngameTest, type Measured, WARMUP_TICKS, WINDOW_TICKS, finishTick } from "./framework/test.ts"
import { agriculture } from "./agriculture/test.ts"
import { fusion } from "./fusion/test.ts"
import { machines } from "./machines/test.ts"
import { nuclear } from "./nuclear/test.ts"
import { rocket } from "./rocket/test.ts"
import { solar } from "./solar/test.ts"
import { steam } from "./steam/test.ts"

const ALL_TESTS: readonly IngameTest<FactoryData>[] = [machines, steam, rocket, nuclear, solar, agriculture, fusion]

const MOD = "calculator-ingame-test"

function source(path: string): string {
    return readFileSync(new URL(path, import.meta.url), "utf8")
}

// Runs all factories in one game and returns their counters by factory name.
function runGame(factorioDir: string, workDir: string): Record<string, Measured> {
    const game = new HeadlessGame(factorioDir, workDir)
    const config = JSON.stringify({
        warmup: WARMUP_TICKS,
        window: WINDOW_TICKS,
        tests: TESTS.map(test => ({ module: test.module, factories: test.factories })),
    })
    const files: Record<string, string> = {
        "info.json": JSON.stringify({ name: MOD, version: "1.0.0", title: "Calculator in-game test", author: "factorio-calculator", factorio_version: "2.1", dependencies: ["space-age"] }),
        "control.lua": source("framework/control.lua"),
        "lib.lua": source("framework/lib.lua"),
        "config.lua": `return [==[${config}]==]\n`,
    }
    for (const test of TESTS) {
        files[`tests/${test.module}.lua`] = source(`${test.module}/build.lua`)
    }
    game.addMod(MOD, files)

    const map = join(workDir, "ingame.zip")
    game.run("--create", map)
    const ticks = Math.max(...TESTS.flatMap(test => test.factories.map(finishTick)))
    game.run("--benchmark", map, "--benchmark-ticks", String(ticks + 1))
    // The game writes this file, so it has the shape that control.lua gives it.
    return JSON.parse(readFileSync(join(game.scriptOutput, "ingame-results.json"), "utf8")) as Record<string, Measured>
}

function format(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

const { values: args } = parseArgs({
    options: {
        factorio: { type: "string", default: process.env["FACTORIO_DIR"] },
        only: { type: "string" },
        keep: { type: "boolean", default: false },
    },
})
const only = args.only
const TESTS: readonly IngameTest<FactoryData>[] = ALL_TESTS
    .map(test => ({ ...test, factories: test.factories.filter(factory => only === undefined || factory.name.includes(only)) }))
    .filter(test => test.factories.length > 0)
if (!args.factorio) {
    console.error("missing --factorio <dir> or FACTORIO_DIR")
    process.exit(2)
}

const workDir = mkdtempSync(join(tmpdir(), "factorio-ingame-"))
let total = 0
let failed = 0
try {
    const measurements = runGame(args.factorio, workDir)
    const { base, browser, close } = await startBrowser()
    try {
        const calculator = new Calculator(browser, base)
        for (const test of TESTS) {
            for (const factory of test.factories) {
                total++
                const measured = measurements[factory.name]
                if (measured === undefined) {
                    console.log(`${factory.name} FAILED: no measurement`)
                    failed++
                    continue
                }
                const { fragment, comparisons } = await test.compare(factory, measured, calculator)
                const ok = comparisons.every(c => c.ok)
                failed += ok ? 0 : 1
                console.log(`${factory.name} ${ok ? "ok" : "FAILED"}  ${fragment}`)
                for (const c of comparisons) {
                    console.log(`  ${c.label}: game ${format(c.game)}, calculator ${format(c.calculator)} ${c.ok ? "ok" : "DIFFERS"}`)
                }
            }
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
console.log(`${total - failed} of ${total} factories match`)
process.exitCode = failed > 0 ? 1 : 0

// Generates public/data/space-age-<version>.json and the matching sprite sheet from a local Factorio install.
//
// Usage: node tools/build-data.js --factorio <dir> [--dump <script-output dir>] [--keep]
//   --factorio  Factorio installation (or set FACTORIO_DIR).
//   --dump      Reuse an existing dump instead of running the game.
//   --keep      Keep the temporary dump directory and print its path.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { convert } from "./lib/convert.js"
import { dumpGameData, gameVersion, readDump } from "./lib/factorio.js"
import { buildSpriteSheet } from "./lib/sprites.js"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

const { values: args } = parseArgs({
    options: {
        factorio: { type: "string", default: process.env.FACTORIO_DIR },
        dump: { type: "string" },
        keep: { type: "boolean", default: false },
    },
})
if (!args.factorio) {
    console.error("missing --factorio <dir> or FACTORIO_DIR")
    process.exit(2)
}

let workDir = null
let outputDir = args.dump
if (!outputDir) {
    workDir = mkdtempSync(join(tmpdir(), "factorio-dump-"))
    outputDir = dumpGameData(args.factorio, workDir)
}

try {
    const version = gameVersion(args.factorio)
    const { raw, locale, runtime } = readDump(outputDir)
    const dataset = convert(raw, locale, version, runtime)
    const { png, hash } = await buildSpriteSheet(dataset, outputDir, join(args.factorio, "data"))

    const sheetPath = join(ROOT, "public", "images", `sprite-sheet-${hash}.png`)
    const dataPath = join(ROOT, "public", "data", `space-age-${version}.json`)
    writeFileSync(sheetPath, png)
    writeFileSync(dataPath, JSON.stringify(dataset, null, 2) + "\n")
    console.log(`wrote ${dataPath}`)
    console.log(`wrote ${sheetPath} (${dataset.sprites.width}x${dataset.sprites.height})`)
} finally {
    if (workDir && args.keep) {
        console.log(`dump kept in ${outputDir}`)
    } else if (workDir) {
        rmSync(workDir, { recursive: true, force: true })
    }
}

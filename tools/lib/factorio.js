// Runs a local Factorio installation headless to dump prototype data, locale and icons.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Mods that make up Space Age. The dump runs with exactly these enabled.
export const SPACE_AGE_MODS = ["base", "elevated-rails", "quality", "recycler", "space-age"]

/**
 * Finds the Factorio executable inside an installation directory.
 *
 * @param {string} factorioDir - Root of the installation, containing bin/ and data/.
 * @returns {string} Path to the executable.
 */
export function findExecutable(factorioDir) {
    for (const arch of ["arm64", "x64"]) {
        const path = join(factorioDir, "bin", arch, "factorio")
        if (existsSync(path)) {
            return path
        }
    }
    throw new Error(`no Factorio executable found in ${factorioDir}/bin`)
}

/**
 * Reads the game version from the base mod's info.json.
 *
 * @param {string} factorioDir
 * @returns {string} Version such as "2.1.21".
 */
export function gameVersion(factorioDir) {
    return JSON.parse(readFileSync(join(factorioDir, "data", "base", "info.json"), "utf8")).version
}

// A mod whose control script writes values that the game computes at runtime, such as item weights.
const DUMP_MOD = "calculator-dump"
const DUMP_FILE = "calculator-dump.json"
const DUMP_MOD_FILES = {
    "info.json": JSON.stringify({ name: DUMP_MOD, version: "1.0.0", title: "Calculator dump", author: "factorio-calculator", factorio_version: "2.1", dependencies: ["space-age"] }),
    "control.lua": `script.on_init(function()
    local weights = {}
    for name, item in pairs(prototypes.item) do
        weights[name] = item.weight
    end
    local daytime = {}
    for name, planet in pairs(game.planets) do
        local surface = planet.surface or planet.create_surface()
        daytime[name] = { dusk = surface.dusk, evening = surface.evening, morning = surface.morning, dawn = surface.dawn }
    end
    helpers.write_file("${DUMP_FILE}", helpers.table_to_json({ item_weights = weights, daytime = daytime }))
end)
`,
}

function writeModList(modDir, extra) {
    writeFileSync(join(modDir, "mod-list.json"), JSON.stringify({
        mods: [...SPACE_AGE_MODS, ...extra].map(name => ({ name, enabled: true })),
    }))
}

/**
 * Runs the three dump commands into workDir/write/script-output, then creates a map with a helper
 * mod that writes runtime values to calculator-dump.json there. The game directory is only read:
 * a separate config file points the write path into workDir, and a separate mod directory
 * enables only the Space Age mods.
 *
 * @param {string} factorioDir - Root of the installation.
 * @param {string} workDir - Empty directory for config, mod list and output.
 * @returns {string} The script-output directory.
 */
export function dumpGameData(factorioDir, workDir) {
    const modDir = join(workDir, "mods")
    const writeDir = join(workDir, "write")
    mkdirSync(modDir, { recursive: true })
    mkdirSync(writeDir, { recursive: true })

    const config = join(workDir, "config.ini")
    writeFileSync(config, `[path]\nread-data=${join(factorioDir, "data")}\nwrite-data=${writeDir}\n`)
    writeModList(modDir, [])

    const exe = findExecutable(factorioDir)
    // The dump flags cannot be combined in one run.
    for (const flag of ["--dump-data", "--dump-icon-sprites", "--dump-prototype-locale"]) {
        console.log(`factorio ${flag}`)
        execFileSync(exe, ["-c", config, "--mod-directory", modDir, flag], { stdio: ["ignore", "ignore", "inherit"] })
    }

    // Runtime values exist only in a running game. Creating a map runs the helper mod's on_init.
    console.log("factorio --create")
    mkdirSync(join(modDir, DUMP_MOD), { recursive: true })
    for (const [name, content] of Object.entries(DUMP_MOD_FILES)) {
        writeFileSync(join(modDir, DUMP_MOD, name), content)
    }
    writeModList(modDir, [DUMP_MOD])
    execFileSync(exe, ["-c", config, "--mod-directory", modDir, "--create", join(workDir, "dump.zip")], { stdio: ["ignore", "ignore", "inherit"] })

    return join(writeDir, "script-output")
}

/**
 * Reads data.raw and all locale files from a script-output directory.
 *
 * @param {string} outputDir - Directory produced by dumpGameData().
 * @returns {{raw: Object, locale: Object<string, Object>, runtime: {item_weights: Object<string, number>, daytime: Object<string, Object<string, number>>}}}
 */
export function readDump(outputDir) {
    const raw = JSON.parse(readFileSync(join(outputDir, "data-raw-dump.json"), "utf8"))
    const runtime = JSON.parse(readFileSync(join(outputDir, DUMP_FILE), "utf8"))
    const locale = {}
    for (const file of readdirSync(outputDir)) {
        if (file.endsWith("-locale.json")) {
            locale[file.slice(0, -"-locale.json".length)] = JSON.parse(readFileSync(join(outputDir, file), "utf8"))
        }
    }
    return { raw, locale, runtime }
}

// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Runs a local Factorio installation headless to dump prototype data, locale and icons.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { LocaleFiles, RawData, RuntimeData } from "./raw.ts"

// Mods that make up Space Age. The dump runs with exactly these enabled.
export const SPACE_AGE_MODS: readonly string[] = ["base", "elevated-rails", "quality", "recycler", "space-age"]

/**
 * Finds the Factorio executable inside an installation directory.
 *
 * @param factorioDir - Root of the installation, containing bin/ and data/.
 * @returns Path to the executable.
 */
export function findExecutable(factorioDir: string): string {
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
 * @returns Version such as "2.1.21".
 */
export function gameVersion(factorioDir: string): string {
    const info: unknown = JSON.parse(readFileSync(join(factorioDir, "data", "base", "info.json"), "utf8"))
    if (typeof info !== "object" || info === null || !("version" in info) || typeof info.version !== "string") {
        throw new Error(`no version in ${factorioDir}/data/base/info.json`)
    }
    return info.version
}

// A mod whose control script writes values that the game computes at runtime, such as item weights,
// to DUMP_FILE when the map is created, and measurements of rocket launches and agricultural towers to
// ROCKET_FILE and AGRICULTURE_FILE when the map runs.
const DUMP_MOD: string = "calculator-dump"
const DUMP_FILE: string = "calculator-dump.json"
const ROCKET_FILE: string = "calculator-rocket.json"
const AGRICULTURE_FILE: string = "calculator-agriculture.json"
// Ticks the measurements run. The agricultural towers need the longest, three harvests per plot after a warmup.
const MEASURE_TICKS: number = 90001
const DUMP_MOD_FILES: Readonly<Record<string, string>> = {
    "info.json": JSON.stringify({ name: DUMP_MOD, version: "1.0.0", title: "Calculator dump", author: "factorio-calculator", factorio_version: "2.1", dependencies: ["space-age"] }),
    "control.lua": readFileSync(new URL("../mod/calculator-dump/control.lua", import.meta.url), "utf8"),
    "rocket.lua": readFileSync(new URL("../mod/calculator-dump/rocket.lua", import.meta.url), "utf8"),
    "agriculture.lua": readFileSync(new URL("../mod/calculator-dump/agriculture.lua", import.meta.url), "utf8"),
}

/**
 * A game installation set up to run headless. The game directory is only read: a separate config
 * file points the write path into the work directory, and a separate mod directory enables only
 * the Space Age mods and the mods added with addMod().
 */
export class HeadlessGame {
    readonly exe: string
    readonly config: string
    readonly modDir: string
    readonly writeDir: string
    private readonly extraMods: string[] = []

    /**
     * @param factorioDir - Root of the installation.
     * @param workDir - Empty directory for config, mods and output.
     */
    constructor(factorioDir: string, workDir: string) {
        this.exe = findExecutable(factorioDir)
        this.modDir = join(workDir, "mods")
        this.writeDir = join(workDir, "write")
        mkdirSync(this.modDir, { recursive: true })
        mkdirSync(this.writeDir, { recursive: true })
        this.config = join(workDir, "config.ini")
        writeFileSync(this.config, `[path]\nread-data=${join(factorioDir, "data")}\nwrite-data=${this.writeDir}\n`)
        this.writeModList()
    }

    /** The directory where scripts write files with helpers.write_file(). */
    get scriptOutput(): string {
        return join(this.writeDir, "script-output")
    }

    /** Writes a mod with the given files, by path within the mod, and enables it. */
    addMod(name: string, files: Readonly<Record<string, string>>): void {
        for (const [file, content] of Object.entries(files)) {
            const path = join(this.modDir, name, file)
            mkdirSync(dirname(path), { recursive: true })
            writeFileSync(path, content)
        }
        this.extraMods.push(name)
        this.writeModList()
    }

    /** Runs the game with the given arguments. If it fails, throws with the end of its output, which holds the error. */
    run(...args: string[]): void {
        console.log(`factorio ${args.join(" ")}`)
        try {
            execFileSync(this.exe, ["-c", this.config, "--mod-directory", this.modDir, ...args], { stdio: ["ignore", "pipe", "pipe"] })
        } catch (error) {
            const output = error instanceof Error && "stdout" in error ? String(error.stdout) : ""
            throw new Error(`factorio ${args.join(" ")} failed:\n${output.split("\n").slice(-20).join("\n")}`)
        }
    }

    private writeModList(): void {
        writeFileSync(join(this.modDir, "mod-list.json"), JSON.stringify({
            mods: [...SPACE_AGE_MODS, ...this.extraMods].map(name => ({ name, enabled: true })),
        }))
    }
}

/**
 * Runs the three dump commands into workDir/write/script-output, then creates and runs a map with a
 * helper mod that writes runtime values and measurements of rocket silos and agricultural towers there.
 *
 * @param factorioDir - Root of the installation.
 * @param workDir - Empty directory for config, mod list and output.
 * @returns The script-output directory.
 */
export function dumpGameData(factorioDir: string, workDir: string): string {
    const game = new HeadlessGame(factorioDir, workDir)
    // The dump flags cannot be combined in one run.
    for (const flag of ["--dump-data", "--dump-icon-sprites", "--dump-prototype-locale"]) {
        game.run(flag)
    }

    // Runtime values exist only in a running game. Creating a map runs the helper mod's on_init.
    game.addMod(DUMP_MOD, DUMP_MOD_FILES)
    const map = join(workDir, "dump.zip")
    game.run("--create", map)
    game.run("--benchmark", map, "--benchmark-ticks", String(MEASURE_TICKS))
    for (const file of [ROCKET_FILE, AGRICULTURE_FILE]) {
        if (!existsSync(join(game.scriptOutput, file))) {
            throw new Error(`${file} not written within ${MEASURE_TICKS} ticks`)
        }
    }

    return game.scriptOutput
}

/** The parsed output of dumpGameData(). */
export interface GameDump {
    readonly raw: RawData
    readonly locale: LocaleFiles
    readonly runtime: RuntimeData
}

/**
 * Reads data.raw and all locale files from a script-output directory.
 *
 * @param outputDir - Directory produced by dumpGameData().
 */
export function readDump(outputDir: string): GameDump {
    // The game writes these files, so they have the shapes in raw.ts. The dataset schema test checks the result.
    const raw = JSON.parse(readFileSync(join(outputDir, "data-raw-dump.json"), "utf8")) as RawData
    const runtime = {
        ...JSON.parse(readFileSync(join(outputDir, DUMP_FILE), "utf8")) as RuntimeData,
        rocket_launch: JSON.parse(readFileSync(join(outputDir, ROCKET_FILE), "utf8")) as RuntimeData["rocket_launch"],
        agricultural_towers: JSON.parse(readFileSync(join(outputDir, AGRICULTURE_FILE), "utf8")) as RuntimeData["agricultural_towers"],
    }
    const locale: Record<string, LocaleFiles[string]> = {}
    for (const file of readdirSync(outputDir)) {
        if (file.endsWith("-locale.json")) {
            locale[file.slice(0, -"-locale.json".length)] = JSON.parse(readFileSync(join(outputDir, file), "utf8")) as LocaleFiles[string]
        }
    }
    return { raw, locale, runtime }
}

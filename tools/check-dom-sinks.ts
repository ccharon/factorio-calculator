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

// Fails if source files use DOM APIs that parse strings as HTML or code. The UI builds all
// elements through d3 or the DOM API, so data values never reach an HTML parser.
// Usage: node tools/check-dom-sinks.ts

import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT: string = fileURLToPath(new URL("..", import.meta.url))

const SINKS: readonly (readonly [RegExp, string])[] = [
    [/\.innerHTML\b/, "innerHTML"],
    [/\.outerHTML\b/, "outerHTML"],
    [/\binsertAdjacentHTML\b/, "insertAdjacentHTML"],
    [/\bdocument\.write(ln)?\s*\(/, "document.write"],
    [/\.html\s*\(/, "d3 .html()"],
    [/\bcreateContextualFragment\b/, "createContextualFragment"],
    [/\beval\s*\(/, "eval"],
    [/\bnew\s+Function\s*\(/, "new Function"],
    [/\bset(Timeout|Interval)\s*\(\s*["'`]/, "string timer callback"],
]

/** A line of source code that uses a forbidden sink. */
export interface Finding {
    readonly line: number
    readonly sink: string
}

/** Returns all .js and .ts files below dir. */
export function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true, recursive: true }).filter(e => e.isFile() && /\.(js|ts)$/.test(e.name)).map(e => join(e.parentPath, e.name))
}

/**
 * Returns one finding per line that contains a forbidden sink.
 *
 * @param source - File content.
 */
export function findSinks(source: string): Finding[] {
    const findings: Finding[] = []
    source.split("\n").forEach((text, i) => {
        for (const [pattern, sink] of SINKS) {
            if (pattern.test(text)) {
                findings.push({ line: i + 1, sink })
            }
        }
    })
    return findings
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    let count = 0
    for (const file of sourceFiles(join(ROOT, "src"))) {
        for (const { line, sink } of findSinks(readFileSync(file, "utf8"))) {
            console.log(`${relative(ROOT, file)}:${line}: ${sink}`)
            count++
        }
    }
    if (count > 0) {
        console.log(`${count} forbidden DOM sink(s)`)
        process.exitCode = 1
    }
}

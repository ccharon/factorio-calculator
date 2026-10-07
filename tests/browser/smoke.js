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

// Loads the calculator in headless Chrome and reports JS errors and the factory table.
// Usage: node tests/browser/smoke.js [--dist] [url-fragment]
import { openCalculator, startBrowser } from "./browser.js"

const args = process.argv.slice(2)
const dist = args.includes("--dist")
const fragment = args.find(a => a !== "--dist") ?? ""
const { base, browser, close } = await startBrowser({ dist })
let errors
try {
    const result = await openCalculator(browser, base, fragment)
    errors = result.errors
    const rows = await result.page.$$eval("#totals tbody tr", trs => trs.map(tr => tr.innerText.replace(/\s+/g, " ").trim()))
    console.log(`rows: ${rows.length}`)
    for (const row of rows) {
        console.log(`  ${row}`)
    }
} finally {
    await close()
}
if (errors.length > 0) {
    console.log(errors.join("\n"))
    process.exitCode = 1
}

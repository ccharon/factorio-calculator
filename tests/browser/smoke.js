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

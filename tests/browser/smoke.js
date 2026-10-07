// Loads the calculator in headless Chrome and reports JS errors and the factory table.
// Usage: node tests/browser/smoke.js [url-fragment] [base-url]
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer-core"

const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable"
const PORT = process.env.PORT || "8123"
const fragment = process.argv[2] || ""
let base = process.argv[3]

let server = null
if (!base) {
    const serve = fileURLToPath(new URL("../../tools/serve.js", import.meta.url))
    server = spawn(process.execPath, [serve], { env: { ...process.env, PORT }, stdio: ["ignore", "pipe", "inherit"] })
    await new Promise(resolve => server.stdout.once("data", resolve))
    base = `http://127.0.0.1:${PORT}`
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const errors = []
try {
    const page = await browser.newPage()
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`))
    page.on("console", m => {
        if (m.type() === "error") {
            errors.push(`console: ${m.text()}`)
        }
    })
    await page.goto(`${base}/calc.html${fragment}`)
    await page.waitForSelector("#totals tbody tr", { timeout: 20000 }).catch(() => errors.push("factory table did not render"))
    const rows = await page.$$eval("#totals tbody tr", trs => trs.map(tr => tr.innerText.replace(/\s+/g, " ").trim()))
    console.log(`rows: ${rows.length}`)
    for (const row of rows) {
        console.log(`  ${row}`)
    }
    console.log(`hash: ${await page.evaluate(() => window.location.hash)}`)
} finally {
    await browser.close()
    server?.kill()
}
if (errors.length > 0) {
    console.log(errors.join("\n"))
    process.exitCode = 1
}

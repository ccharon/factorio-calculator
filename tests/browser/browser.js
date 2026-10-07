// Shared setup for browser checks: starts the dev server and a headless Chrome.
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer-core"

const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable"

/**
 * Starts tools/serve.js and headless Chrome.
 *
 * @param {string} [base] - Base URL of an already running server. If omitted, a server is started.
 * @returns {Promise<{base: string, browser: import("puppeteer-core").Browser, close: () => Promise<void>}>}
 */
export async function startBrowser(base) {
    let server = null
    if (!base) {
        const port = process.env.PORT || "8123"
        const serve = fileURLToPath(new URL("../../tools/serve.js", import.meta.url))
        server = spawn(process.execPath, [serve], { env: { ...process.env, PORT: port }, stdio: ["ignore", "pipe", "inherit"] })
        await new Promise(resolve => server.stdout.once("data", resolve))
        base = `http://127.0.0.1:${port}`
    }
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
    return {
        base,
        browser,
        async close() {
            await browser.close()
            server?.kill()
        },
    }
}

/**
 * Opens the calculator with a URL fragment and waits until the factory table is rendered.
 * JS errors and console errors are collected in the returned errors list.
 *
 * @param {import("puppeteer-core").Browser} browser
 * @param {string} base - Server base URL.
 * @param {string} fragment - URL fragment including "#", or "".
 * @returns {Promise<{page: import("puppeteer-core").Page, errors: string[]}>}
 */
export async function openCalculator(browser, base, fragment) {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`))
    page.on("console", m => {
        if (m.type() === "error") {
            errors.push(`console: ${m.text()}`)
        }
    })
    await page.goto(`${base}/calc.html${fragment}`)
    await page.waitForSelector("#totals tbody tr", { timeout: 20000 }).catch(() => errors.push("factory table did not render"))
    return { page, errors }
}

// Shared setup for browser checks: starts Vite and a headless Chrome.
import puppeteer from "puppeteer-core"
import { createServer, preview } from "vite"

const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable"

/**
 * Starts a Vite server and headless Chrome.
 *
 * @param {Object} [options]
 * @param {string} [options.base] - Base URL of an already running server. No server is started then.
 * @param {boolean} [options.dist] - Serve the production build in dist/ instead of the sources.
 *     Run `npm run build` first.
 * @returns {Promise<{base: string, browser: import("puppeteer-core").Browser, close: () => Promise<void>}>}
 */
export async function startBrowser({ base, dist = false } = {}) {
    let server = null
    if (!base) {
        const port = Number(process.env.PORT) || 8123
        const config = { logLevel: "error", server: { port, strictPort: true }, preview: { port, strictPort: true } }
        if (dist) {
            server = await preview(config)
        } else {
            server = await createServer(config)
            await server.listen()
        }
        base = server.resolvedUrls.local[0]
    }
    // GitHub runners on Ubuntu 24.04 block the Chrome sandbox through AppArmor.
    const args = process.env.CI ? ["--no-sandbox"] : []
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args })
    return {
        base,
        browser,
        async close() {
            await browser.close()
            await server?.close()
        },
    }
}

/**
 * Opens the calculator with a URL fragment and waits until the factory table is rendered.
 * JS errors and console errors are collected in the returned errors list.
 *
 * @param {import("puppeteer-core").Browser} browser
 * @param {string} base - Server base URL ending in "/".
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
    await page.goto(`${base}${fragment}`)
    await page.waitForSelector("#totals tbody tr", { timeout: 20000 }).catch(() => errors.push("factory table did not render"))
    return { page, errors }
}

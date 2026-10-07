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
// Shared setup for browser checks: starts Vite and a headless Chrome.
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { type InlineConfig, createServer, preview } from "vite"

const CHROME = process.env["CHROME"] || "/usr/bin/google-chrome-stable"

/** Options of startBrowser(). */
export interface BrowserOptions {
    /** Base URL of an already running server. No server is started then. */
    readonly base?: string
    /** Serve the production build in dist/ instead of the sources. Run `npm run build` first. */
    readonly dist?: boolean
}

/** A running headless Chrome and the base URL of the calculator. */
export interface BrowserSession {
    readonly base: string
    readonly browser: Browser
    /** Closes Chrome and the server started for it. */
    readonly close: () => Promise<void>
}

/** A loaded calculator page and the JS and console errors it reported. */
export interface CalculatorPage {
    readonly page: Page
    readonly errors: string[]
}

/** Starts a Vite server, unless options.base names a running one, and headless Chrome. */
export async function startBrowser({ base, dist = false }: BrowserOptions = {}): Promise<BrowserSession> {
    let server: { close(): Promise<void> } | null = null
    if (!base) {
        const port = Number(process.env["PORT"]) || 8123
        const config: InlineConfig = { logLevel: "error", server: { port, strictPort: true }, preview: { port, strictPort: true } }
        let url: string | undefined
        if (dist) {
            const previewServer = await preview(config)
            server = previewServer
            url = previewServer.resolvedUrls?.local[0]
        } else {
            const devServer = await createServer(config)
            await devServer.listen()
            server = devServer
            url = devServer.resolvedUrls?.local[0]
        }
        if (url === undefined) {
            throw new Error("the server has no local URL")
        }
        base = url
    }
    // GitHub runners on Ubuntu 24.04 block the Chrome sandbox through AppArmor.
    const args = process.env["CI"] ? ["--no-sandbox"] : []
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args })
    return {
        base,
        browser,
        close: async () => {
            await browser.close()
            await server?.close()
        },
    }
}

/**
 * Opens the calculator with a URL fragment and waits until the factory table is rendered.
 * JS errors and console errors are collected in the returned errors list.
 *
 * @param base - Server base URL ending in "/".
 * @param fragment - URL fragment including "#", or "".
 */
export async function openCalculator(browser: Browser, base: string, fragment: string): Promise<CalculatorPage> {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on("pageerror", (e: unknown) => errors.push(`pageerror: ${e instanceof Error ? e.message : String(e)}`))
    page.on("console", m => {
        if (m.type() === "error") {
            errors.push(`console: ${m.text()}`)
        }
    })
    await page.goto(`${base}${fragment}`)
    await page.waitForSelector("#totals tbody tr", { timeout: 20000 }).catch(() => errors.push("factory table did not render"))
    return { page, errors }
}

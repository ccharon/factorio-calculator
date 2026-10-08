// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Access to the calculator in headless Chrome for the in-game tests.

import type { Browser } from "puppeteer-core"
import { openCalculator } from "../../browser/browser.ts"

/** The calculator, opened with URL fragments in a headless Chrome. */
export class Calculator {
    private readonly browser: Browser
    private readonly base: string
    private readonly groupKeys: Map<string, string> = new Map()

    /**
     * @param base - Server base URL ending in "/".
     */
    constructor(browser: Browser, base: string) {
        this.browser = browser
        this.base = base
    }

    /**
     * Opens the calculator with fragment, waits for the solution and returns what read returns in
     * the page. read runs in the page, so it can use nothing outside its body. Throws on JS errors
     * and if read returns null.
     *
     * @param arg - Passed to read, such as a recipe key.
     */
    async evaluate<T>(fragment: string, read: (arg: string) => T | null, arg: string): Promise<Awaited<T>> {
        const { page, errors } = await openCalculator(this.browser, this.base, fragment)
        try {
            if (errors.length > 0) {
                throw new Error(`${fragment}: ${errors.join("\n")}`)
            }
            const result = await page.evaluate(read, arg)
            if (result === null) {
                throw new Error(`${fragment}: no result for ${arg}`)
            }
            return result
        } finally {
            await page.close()
        }
    }

    /** Returns the key of the building group of recipe, which the buildings setting needs. */
    async groupKey(recipe: string): Promise<string> {
        const cached = this.groupKeys.get(recipe)
        if (cached !== undefined) {
            return cached
        }
        const key = await this.evaluate("#planet=nauvis", (recipeKey: string) => {
            const r = window.spec.recipes.get(recipeKey)
            return (r === undefined ? undefined : window.spec.recipeGroups.get(r)?.key) ?? null
        }, recipe)
        this.groupKeys.set(recipe, key)
        return key
    }
}

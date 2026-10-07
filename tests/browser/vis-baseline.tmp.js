// Temporary: records the visualizer SVG markup for comparison during the TypeScript port.
import { createHash } from "node:crypto"
import { writeFileSync } from "node:fs"
import { openCalculator, startBrowser } from "./browser.js"

const out = process.argv[2]
const scenarios = [
    "#items=processing-unit:r:60&planet=nauvis",
    "#items=plastic-bar:r:600&planet=nauvis",
    "#items=electromagnetic-science-pack:r:60&planet=fulgora",
    "#items=agricultural-science-pack:r:60&planet=gleba",
]
const modes = ["vt=sankey&vd=right", "vt=sankey&vd=down", "vt=boxline&vd=down", "vt=boxline&vd=right"]
const { base, browser, close } = await startBrowser()
const result = {}
try {
    for (const s of scenarios) {
        for (const m of modes) {
            const { page, errors } = await openCalculator(browser, base, `${s}&${m}&tab=graph`)
            await page.evaluate(() => document.getElementById("graph_button").click())
            await new Promise(r => setTimeout(r, 300))
            const svg = await page.evaluate(() => document.getElementById("graph").outerHTML)
            result[`${s} ${m}`] = { hash: createHash("sha256").update(svg).digest("hex").slice(0, 16), length: svg.length, errors }
            await page.close()
        }
    }
} finally {
    await close()
}
writeFileSync(out, JSON.stringify(result, null, 2))
console.log(Object.values(result).map(r => `${r.hash} ${r.length} ${r.errors.length}`).join("\n"))

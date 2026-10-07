import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { test } from "node:test"
import Ajv2020 from "ajv/dist/2020.js"

const dataDir = new URL("../data/", import.meta.url)
const schema = JSON.parse(readFileSync(new URL("schema.json", dataDir), "utf8"))
const validate = new Ajv2020({ allErrors: true }).compile(schema)
const files = readdirSync(dataDir).filter(f => /^space-age-.*\.json$/.test(f))

for (const file of files) {
    const data = JSON.parse(readFileSync(new URL(file, dataDir), "utf8"))
    const itemKeys = new Set(data.items.map(i => i.key))

    test(`${file} matches data/schema.json`, () => {
        assert.ok(validate(data), JSON.stringify(validate.errors?.slice(0, 5), null, 2))
    })

    test(`${file} references only known items`, () => {
        const missing = new Set()
        const check = key => itemKeys.has(key) || missing.add(key)
        for (const r of data.recipes) {
            r.ingredients.forEach(i => check(i.name))
            r.results.forEach(p => check(p.name))
        }
        data.resources.forEach(r => r.results.forEach(p => check(p.name)))
        data.plants.forEach(p => check(p.seed))
        data.fuel.forEach(f => check(f.item_key))
        data.modules.forEach(m => check(m.item_key))
        data.spoilage.forEach(s => check(s.from_item) && check(s.to_item))
        data.planets.forEach(p => p.resources.offshore.forEach(check))
        assert.deepEqual([...missing], [])
    })

    test(`${file} planet resources and plants exist`, () => {
        const resources = new Set(data.resources.map(r => r.key))
        const plants = new Set(data.plants.map(p => p.key))
        for (const p of data.planets) {
            p.resources.resource.forEach(r => assert.ok(resources.has(r), `${p.key}: ${r}`))
            p.resources.plants.forEach(r => assert.ok(plants.has(r), `${p.key}: ${r}`))
        }
    })

    test(`${file} has its sprite sheet`, () => {
        assert.ok(existsSync(new URL(`../images/sprite-sheet-${data.sprites.hash}.png`, import.meta.url)))
    })
}

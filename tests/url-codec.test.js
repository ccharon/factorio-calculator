import assert from "node:assert/strict"
import { test } from "vitest"
import { compress, decodeFragment, decompress, encodeSettings, parseSettings } from "../src/state/url-codec.ts"

const long = "items=" + Array.from({ length: 40 }, (_, i) => `iron-gear-wheel-${i}:r:60`).join(",") + "&planet=nauvis"

test("compress and decompress round-trip", async () => {
    assert.equal(await decompress(await compress(long)), long)
})

test("encodeSettings keeps short strings plain and zips long ones", async () => {
    assert.equal(await encodeSettings("items=coal:r:1"), "items=coal:r:1")
    const encoded = await encodeSettings(long)
    assert.ok(encoded.startsWith("zip="))
    assert.ok(encoded.length < long.length)
})

const noWarning = () => assert.fail("unexpected warning")

test("decodeFragment reads plain and zipped fragments", async () => {
    assert.deepEqual(await decodeFragment("#a=1&b=x=y&c", noWarning), new Map([["a", "1"], ["b", "x=y"]]))
    const zipped = await decodeFragment("#" + await encodeSettings(long), noWarning)
    assert.equal(zipped.get("planet"), "nauvis")
})

test("decodeFragment ignores broken compressed data and warns", async () => {
    const warnings = []
    const warn = (message, value) => warnings.push(message)
    assert.deepEqual(await decodeFragment("#zip=AAAA", warn), new Map())
    assert.deepEqual(await decodeFragment("#zip=not base64!", warn), new Map())
    assert.equal(warnings.length, 2)
})

test("decompress rejects output above the size limit", async () => {
    const big = await compress("x".repeat(5000))
    await assert.rejects(decompress(big, 1000), RangeError)
})

test("parseSettings skips pairs without a value", () => {
    assert.deepEqual(parseSettings("x&y=1"), new Map([["y", "1"]]))
})

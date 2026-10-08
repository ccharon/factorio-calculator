// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict"
import { test } from "vitest"
import { findSinks } from "../tools/check-dom-sinks.ts"

test("finds HTML and code sinks with their line numbers", () => {
    const source = [
        "el.innerHTML = x",
        "sel.html(markup)",
        "el.insertAdjacentHTML(\"beforeend\", x)",
        "eval(code)",
        "setTimeout(\"run()\", 10)",
    ].join("\n")
    assert.deepEqual(findSinks(source).map(f => [f.line, f.sink]), [
        [1, "innerHTML"],
        [2, "d3 .html()"],
        [3, "insertAdjacentHTML"],
        [4, "eval"],
        [5, "string timer callback"],
    ])
})

test("accepts text-based DOM building", () => {
    assert.deepEqual(findSinks("sel.text(name)\nel.textContent = name\nsetTimeout(() => run(), 10)"), [])
})

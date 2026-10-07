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

import assert from "node:assert/strict"
import { test } from "vitest"
import { findSinks } from "../tools/check-dom-sinks.js"

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

// Provides the libraries that calc.html loads via <script> tags.
import { readFileSync } from "node:fs"
import { runInThisContext } from "node:vm"

function loadUmd(path) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8")
    const module = { exports: {} }
    runInThisContext(`(function (module, exports) {${source}\n})`)(module, module.exports)
    return module.exports
}

globalThis.bigInt = loadUmd("../../third_party/BigInteger.min.js")
globalThis.pako = loadUmd("../../third_party/pako.min.js")

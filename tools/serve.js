// Static file server for local development. Not meant for production use.
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, normalize, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const PORT = Number(process.env.PORT) || 8000
const HOST = process.env.HOST || "127.0.0.1"

const TYPES = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".json", "application/json"],
    [".png", "image/png"],
    [".gif", "image/gif"],
    [".svg", "image/svg+xml"],
    [".wasm", "application/wasm"],
])

// Only files the page needs are served, so node_modules and tooling stay private.
const DENY = ["node_modules", "tools", "tests", ".git", ".idea"]

function resolvePath(url) {
    let path = decodeURIComponent(new URL(url, "http://localhost").pathname)
    if (path.endsWith("/")) {
        path += "calc.html"
    }
    const full = normalize(join(ROOT, path))
    if (!full.startsWith(ROOT)) {
        return null
    }
    const first = full.slice(ROOT.length).split(sep)[0]
    if (DENY.includes(first) || first.startsWith(".") || (extname(full) === ".json" && first !== "data")) {
        return null
    }
    return full
}

const server = createServer(async (req, res) => {
    let path = null
    try {
        path = resolvePath(req.url)
    } catch {
        // Malformed percent-encoding.
    }
    const type = path && TYPES.get(extname(path))
    if (!type || (req.method !== "GET" && req.method !== "HEAD")) {
        res.writeHead(404).end()
        return
    }
    try {
        const info = await stat(path)
        if (!info.isFile()) {
            throw new Error("not a file")
        }
        res.writeHead(200, {
            "Content-Type": type,
            "Content-Length": info.size,
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        })
        if (req.method === "HEAD") {
            res.end()
            return
        }
        createReadStream(path).pipe(res)
    } catch {
        res.writeHead(404).end()
    }
})

server.listen(PORT, HOST, () => {
    console.log(`http://${HOST}:${PORT}/calc.html`)
})

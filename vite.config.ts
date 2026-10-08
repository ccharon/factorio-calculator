// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Build, dev server and test configuration.
import { defineConfig } from "vitest/config"

// Content Security Policy of the production build. The dev server injects inline styles, so it runs without one.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'"

export default defineConfig({
    plugins: [{
        name: "content-security-policy",
        apply: "build",
        transformIndexHtml: html => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`),
    }],
    // Relative asset paths, so the build works from any directory on a web server.
    base: "./",
    build: {
        outDir: "dist",
        target: "es2022",
    },
    // The simplex worker is a module worker.
    worker: {
        format: "es",
    },
    server: {
        host: "127.0.0.1",
        port: 8000,
    },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
    },
})

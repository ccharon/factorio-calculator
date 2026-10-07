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
    server: {
        host: "127.0.0.1",
        port: 8000,
    },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
    },
})

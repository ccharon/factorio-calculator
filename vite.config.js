// Build, dev server and test configuration.
import { defineConfig } from "vitest/config"

export default defineConfig({
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
        include: ["tests/**/*.test.{js,ts}"],
        environment: "node",
    },
})

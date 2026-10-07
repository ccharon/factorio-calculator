import js from "@eslint/js"
import nounsanitized from "eslint-plugin-no-unsanitized"
import globals from "globals"

export default [
    {
        ignores: ["third_party/**", "posts/**", "node_modules/**", "d3-sankey/**"],
    },
    js.configs.recommended,
    nounsanitized.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                // Loaded via <script> tags in calc.html.
                d3: "readonly",
                bigInt: "readonly",
                pako: "readonly",
                Popper: "readonly",
                dagre: "readonly",
            },
        },
        rules: {
            "no-eval": "error",
            "no-implied-eval": "error",
            "no-new-func": "error",
            // d3 callbacks receive (event, d) positionally.
            "no-unused-vars": ["error", {args: "none"}],
        },
    },
    {
        files: ["tests/**/*.js", "tools/**/*.js", "eslint.config.js"],
        languageOptions: {
            globals: globals.node,
        },
    },
]

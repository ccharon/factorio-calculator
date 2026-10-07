# Implementation plan

Goal: a calculator for Factorio 2.1 with Space Age only, with current game data, the missing Space Age mechanics, and a hardened code base.

Each phase ends in a working calculator and its own commits.

## Findings

### Game data (2.1.21 vs. shipped `space-age-2.0.55.json`)

- 662 recipes in 2.1, 621 in the dataset. 46 new (barrel fill/empty, `iron-ore-melting`, `copper-ore-melting`, `landing-pad-unloading-bay`, `tree-seed`, `space-platform-starter-pack`, parameters). 5 removed or renamed (`molten-iron`, `molten-copper`, `wood-processing`, two recycling recipes). 303 changed, mostly recycling outputs and asteroid crushing yields.
- Recipes have `categories` (list) instead of `category`. The combined categories (`chemistry-or-cryogenics`, `metallurgy-or-assembling`, `electronics`, `pressing` and others) no longer exist. The building-group model in `factory.js` assumes one category per recipe and must be rebuilt.
- New product fields: `extra_count_fraction` (613 results, all recycling), `independent_probability`, `shared_probability`, `ignored_by_productivity`, `percent_spoiled`. The loader only reads `probability`.
- Stone and steel furnace have a surface condition (pressure >= 10). Crusher requires zero gravity. Machine surface conditions are ignored today.
- Quality: `next_probability` is 1, new `chain_probability`. Modules have per-quality effect multipliers.
- 8 technologies change recipe productivity (`steel-plate-productivity`, `processing-unit-productivity` and others). Not modelled.

### Missing mechanics

| Mechanic | State |
|----------|-------|
| Multiple categories per recipe | missing (breaks building selection) |
| Machine surface conditions | missing |
| Recycling results with fractional amounts | wrong |
| Recipe productivity research and +300% cap | missing |
| Biochamber nutrients as fuel | wrong (uses coal) |
| Space platforms: asteroid collection, crushing, thrusters | missing |
| Spoilage | partial (pseudo recipes only) |
| Agricultural tower and plant growth | partial |
| Heating tower, fusion reactor/generator, steam turbines, solar per planet | missing |
| Captive biter spawner | missing |
| Rocket launch and cargo in Space Age | uses the vanilla satellite recipe |
| Quality of machines, modules and beacons | missing |

### Code robustness and security

- `calc.html` has no doctype (quirks mode) and uses inline scripts and `onclick` attributes. This blocks a Content Security Policy.
- Google Analytics `analytics.js` with a Universal Analytics ID. UA was shut down in 2023. It still sends visitor data to Google without consent (A05, privacy).
- `settings.js`: `DEFAULT_MODIFICATION = "2-0-10"` does not exist in `MODIFICATIONS`.
- `fragment.js` `loadSettings`: `atob`, `pako.inflateRaw` and `decodeURIComponent` run without error handling. A malformed URL hash throws during init and leaves an empty page. No size limit on the inflated data (decompression bomb in the URL).
- `renderTargets` throws on unknown target type. Many settings parsers trust input (`Number(...)`, `Rational.from_string` on arbitrary text).
- `d3.select("#" + tabName + "_tab")` uses the `tab` URL value as a CSS selector. Invalid input throws.
- No DOM XSS sinks found (`innerHTML`, `.html()`, `eval` are unused). Keep it that way.
- Vendored libraries without version pinning or integrity data: d3 6.5.0 (current 7.x), dagre, BigInteger.js (native `BigInt` replaces it), popper 2.11.8 (end of life, successor is Floating UI), pako 2.1.0 (current). `posts/` ships d3 3.5.17 and function-plot via bower.
- Unused code: `boxline.js`, graphviz library (870 KB wasm), `ResourceIcon`, `dump.lua` (1.1 API), `process_data.py` (1.1 data format), legacy URL migration (`fixLegacySettings`, legacy beacon format).
- No tests, no linter, no CI.

## Decisions

| Topic | Decision |
|-------|----------|
| Data generation | New in-repo Node script using the local Factorio dump and `sharp` for the sprite sheet. Replaces `dump.lua` and `process_data.py`. |
| Languages | TypeScript for the app, JavaScript for Node tools. No Python in the repository. |
| Build | TypeScript and Vite, no UI framework. All libraries come from npm. |
| Branches | `main` for releases, `develop` for work. A GitHub Action builds `main` into an orphan `dist` branch, as in ccharon/website-sudoku. The deploy webhook is added after the migration. |
| UI | The current look stays. |
| Quality | Effects of machine, module and beacon quality first. Recycling loops later. |
| URL compatibility | Clean break. Only URLs created by this version must stay stable. |
| Dev tooling | Oxlint with type-aware rules (no JS plugins, they are alpha), TypeScript 7, Vitest, puppeteer-core with Chrome. |

## Phase 0: Tooling

1. Done: `package.json`, `eslint.config.js` with `eslint-plugin-no-unsanitized`, `node --test`, tests for `rational.js`.
2. Fix the 60 lint errors. Real bugs among them: `spec` used without import in `belt.js` and `building.js`, undefined `recipes` in `debug.js`, undefined `minusOne` and `Exception` in `simplex.js`.
3. Unit tests for `fragment.js` (round trip, malformed input) and the solver on small recipe sets. `fragment.js` first needs its parsing split from the DOM code.
4. Snapshot tests: fixed URL hashes with their building counts, recorded before the refactors. They run through `tests/browser/smoke.js` (`puppeteer-core` with the installed Chrome), so they need no Chrome extension.

## Phase 1: Cleanup to Space Age 2.1 scope

Done. Lint passes. Chrome check on the 2.0.55 Space Age dataset shows no console errors, and the factory table matches the previous version.

1. Remove vanilla and 1.1 datasets, their sprite sheets, `useLegacyCalculation`, legacy settings migration, the dataset selector.
2. Remove `boxline.js`, graphviz, `dump.lua`, `process_data.py`, `posts/`, unused helpers.
3. Add `tools/serve.js` as a dependency-free local dev server (`npm start`).
4. Remove Google Analytics, Patreon and Discord links of the upstream author. Keep license headers and attribution in About.
5. Update FAQ and About texts (pipe numbers and expensive mode no longer exist).

## Phase 2: Data pipeline

Done. `npm run build-data` generates `public/data/space-age-2.1.21.json` and the sprite sheet. `src/data/dataset.schema.json` defines the format. Known limitations until phase 4: the loader uses only the first recipe category, and burner machines always burn the preferred chemical fuel.

1. New `tools/build-data.js`: runs Factorio `--dump-data` and `--dump-icon-sprites` against the local install, writes `data/space-age-<version>.json` and the sprite sheet. Uses `sharp` for scaling and compositing icons.
2. Read localized names from `--dump-prototype-locale`.
3. Normalize in the script: power strings to numbers, product amounts including `extra_count_fraction`, `amount_min/max`, both probability types.
4. Export every field the new mechanics need (surface conditions of machines, quality, research productivity effects, asteroid and thruster data, heat and fusion entities).
5. Document the command in README.

## Phase 3: TypeScript and Vite

Comes before the model changes, so phases 4 to 6 are written once, in the new structure. The migration must not change any result.

1. Done. Snapshot tests: `tests/snapshots/factory.json` holds exact rates, building counts and power for 17 URL scenarios across all planets, recorded with the current code. The recorded output is the expected result for the new build.
2. Done. Branches and CI: rename `master` to `main`, create `develop`. `check.yml` runs lint, type check, tests and build on `develop` and pull requests. `deploy.yml` builds `main` and force-pushes `dist/` as the root of an orphan `dist` branch. Dependabot keeps npm packages current.
3. Done. Project layout:

   | Path | Content |
   |------|---------|
   | `index.html` | Vite entry, replaces `calc.html` and `index.html`. No inline scripts or handlers. |
   | `src/main.ts` | Startup: load dataset, read URL settings, render. |
   | `src/core/` | Rational numbers, matrix, simplex, solver, priority list, cycle detection. No DOM access. |
   | `src/data/` | Dataset loaders: items, recipes, buildings, modules, belts, fuel, planets, groups. |
   | `src/state/` | `FactorySpecification` and URL settings parsing and formatting. |
   | `src/ui/` | Factory table, build targets, settings, resources, tooltips, dropdowns, icons, tabs. |
   | `src/visualize/` | Sankey and box-and-line views, circle paths, the modified d3-sankey copy. |
   | `src/styles/` | CSS. |
   | `public/` | Dataset, sprite sheet, favicon, SVG icons. Copied unchanged into the build. |
   | `tools/` | Node scripts: data build. |
   | `tests/` | Vitest tests. |

4. Dependencies from npm, `third_party/` is deleted. Done except `CompressionStream`: `pako` comes from npm until the `state` port. `src/core/rational.ts` uses native `BigInt`.

   | Library | Replacement |
   |---------|-------------|
   | `BigInteger.min.js` | Native `BigInt` in `src/core/rational.ts`. |
   | `d3.min.js` 6.5 | `d3` 7.9, or only the used `d3-*` modules. |
   | `dagre.min.js` 0.8 | `@dagrejs/dagre`, the maintained fork. |
   | `popper.min.js` | `@floating-ui/dom`. |
   | `pako.min.js` | Native `CompressionStream("deflate-raw")`. URL parsing becomes async. |

5. Done. Tooling: Vitest replaces `node --test`. `tsc` in strict mode and Oxlint with type-aware rules run in `npm run check`. `tools/check-dom-sinks.js` replaces `eslint-plugin-no-unsanitized`. `npm start` runs the Vite dev server.
6. Port order: `core` first with strict types and the existing unit tests, then `data`, `state`, `ui`, `visualize`. Each step keeps the snapshot tests green.
7. Done. Delete the root-level JS files, `calc.html`, `third_party/` and `d3-sankey/`. Update README and CLAUDE.md. The inline event handlers in `index.html` are replaced by `addEventListener` in `src/main.js`.

## Phase 4: Core model for 2.1

1. Replace category-based building groups with "set of machines that can craft this recipe", filtered by the selected planets' surface conditions. Settings store preferred machines per category set.
2. Product amount handling: `ignored_by_productivity`, fractional results, productivity cap.
3. Recipe productivity research as settings (one input per technology).
4. Fuel per building fuel category (nutrients for biochamber, chemical for boilers and burners).
5. Rocket launch and cargo for Space Age.

## Phase 5: Space Age mechanics

Ordered by usefulness for planning:

1. Space platform as a selectable location: asteroid collection as resource, crushing and reprocessing, thruster fuel and oxidizer.
2. Gleba: agricultural tower and plant yield per minute, spoilage chain, captive spawner.
3. Aquilo and Vulcanus: heating tower, fusion power, foundry and melting recipes.
4. Power generation: steam engines, turbines, heat exchangers, solar with per-planet `solar-power`.
5. Quality: quality level for machines, modules and beacons as effect multipliers. Recycling loops for target quality as a later step.

## Phase 6: Robustness and security (OWASP Top 10 2021)

Phase 3 covers the inline handlers, `BigInteger.js`, popper and the vendored libraries. The rest stays.

| Category | Action |
|----------|--------|
| A03 Injection | Whitelist validation for every URL setting (tab, rate, keys must exist in game data, numeric ranges). Keep DOM building through `.text()`. |
| A04 Insecure design | Wrap hash parsing in try/catch, fall back to defaults and show a message. Cap inflated hash size. |
| A05 Misconfiguration | Add doctype, move inline scripts and handlers into modules, add a strict CSP (`default-src 'self'`) via meta tag, `rel="noopener"` on external links, `referrer` policy. |
| A06 Vulnerable components | Update d3 to 7.x, replace BigInteger.js with native `BigInt`, replace popper with Floating UI or CSS positioning, record versions and licenses in `third_party/README`. |
| A08 Integrity | Vendor all libraries locally with SHA-256 checksums in the repo. No CDN at runtime. |
| A09 Logging | Replace scattered `console.log` with one warning helper that also shows invalid-URL messages in the UI. |

A01, A02, A07 and A10 do not apply: no server, no authentication, no secrets, no server-side requests.

Also: modernize CSS (custom properties already partly used by `color.js`), keyboard access for dropdowns and toggles, `<button>` instead of clickable `<div>`.

## Phase 7: Documentation

Rewrite README per the writing rules, update changelog, keep CLAUDE.md current.

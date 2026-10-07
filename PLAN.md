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
   | `src/visualize/` | Sankey and box-and-line views, Sankey layout adapted from d3-sankey, circle paths. |
   | `src/styles/` | CSS. |
   | `public/` | Dataset, sprite sheet, favicon, SVG icons. Copied unchanged into the build. |
   | `tools/` | Node scripts: data build. |
   | `tests/` | Vitest tests. |

4. Dependencies from npm, `third_party/` is deleted. Done. `src/core/rational.ts` uses native `BigInt`, `src/state/url-codec.ts` uses `CompressionStream`.

   | Library | Replacement |
   |---------|-------------|
   | `BigInteger.min.js` | Native `BigInt` in `src/core/rational.ts`. |
   | `d3.min.js` 6.5 | `d3` 7.9, or only the used `d3-*` modules. |
   | `dagre.min.js` 0.8 | `@dagrejs/dagre`, the maintained fork. |
   | `popper.min.js` | `@floating-ui/dom`. |
   | `pako.min.js` | Native `CompressionStream("deflate-raw")`. URL parsing becomes async. |

5. Done. Tooling: Vitest replaces `node --test`. `tsc` in strict mode and Oxlint with type-aware rules run in `npm run check`. `tools/check-dom-sinks.js` replaces `eslint-plugin-no-unsanitized`. `npm start` runs the Vite dev server.
6. Done. All of `src/` is TypeScript with `allowJs` off. The d3-sankey copy is replaced by `src/visualize/sankey-layout.ts`.
   Port order: `core` first with strict types and the existing unit tests, then `data`, `state`, `ui`, `visualize`. Each step keeps the snapshot tests green.
7. Done. Delete the root-level JS files, `calc.html`, `third_party/` and `d3-sankey/`. Update README and CLAUDE.md. The inline event handlers in `index.html` are replaced by `addEventListener` in `src/main.js`.

## Phase 4: Core model for 2.1

1. Done. Building groups are the sets of machines that can craft a recipe, filtered by the selected planets' surface conditions. Settings store the selected machine per group.
2. Done. Productivity multiplies only the part of a product that `ignored_by_productivity` leaves, and recipe productivity is capped at `maximum_productivity` (default +300%). Mining productivity has no cap.
3. Done. The dataset has `recipe_productivity` (technologies with `change-recipe-productivity` effects). Settings have one level input per technology, stored as `rprod=<key>:<level>,...`.
4. Done. Fuels have the 2.1 `fuel_categories` list. Each burner building burns the selected fuel of its category (`spec.getFuel()`), and settings show one fuel row per category with a choice. `fuel=` holds a list of fuel keys.
5. Done. Items carry their runtime weight. Every launchable item has an item in orbit (`<key>-in-orbit`) and a launch recipe that takes ⌊lift weight / item weight⌋ items and the rocket parts of one launch. Targets have a switch that selects the item in orbit.

## Phase 4a: Layering of `src/data/` (done)

`src/data/` must not import `src/ui/` or `src/state/`. Today the data classes create `Icon` objects, build tooltip DOM in `renderTooltip()`, format energy with `ui/energy.ts`, and read the global `spec` (`Recipe.gives()`, fuel, building tooltips).

1. Data classes keep only plain data such as `icon_col` and `icon_row`. Icons and tooltips are built in `src/ui/` from that data.
2. Calculations that need settings (productivity, fuel, building choice) take a context interface as a parameter, like `BuildingContext`, instead of importing `spec`.
3. A check fails on imports from `src/ui/` or `src/state/` in `src/data/` and `src/core/`. Exceptions are explained in the commit and in CLAUDE.md.

## Phase 5: Space Age mechanics

Ordered by usefulness for planning:

1. Done. The space platform surface has every asteroid chunk that spawns in the solar system as a resource without building (`resources.asteroid`; the collector rate depends on the asteroid density). Crushing, reprocessing and thruster fuel are ordinary recipes. Thruster consumption per performance level is not modelled; targets set fuel and oxidizer rates directly.
2. Done. Plants have their growth time and the agricultural tower as building. A tower tends `plots` plants (48, from radius, grid size and collision box) and harvests each once per growth time. Spoilage recipes and the captive spawner (burning bioflux since phase 4.4) were already modelled. Spoilage during transport is not modelled.
3. Energy as pseudo items. Foundry and melting recipes already work.
   1. Done. Electric buildings use the abstract item `electricity` (MJ, so a rate is in MW): working power with module effect plus idle drain, linear in the building count. Without generators it is a resource without priority, so it costs nothing and does not change the solution.
   2. Done. Generators are recipes that produce electricity: steam engine from boiler steam, solar panel per planet (`solar-power` × average light from the runtime daytime parameters), nuclear reactor heat → heat exchanger → `steam-500` → steam turbine. Generators are disabled on every planet until enabled in the recipe toggles; while one is enabled, the free electricity import is dropped. The reactor neighbour bonus is not modelled. Fusion: the reactor turns cold fluoroketone into plasma with electricity and fusion cells, the generator turns plasma into electricity and hot fluoroketone; the plasma energy comes from the generator's output over its flow.
   3. Done. While every selected planet requires heating (Aquilo), buildings use their `heating_energy` as the abstract item `heat` (MJ). Heating towers and nuclear reactors supply it and are disabled by default like generators; otherwise heat is a free import. Inserters, belts and pipes are not counted.
4. Done in step 3: steam engines, turbines, heat exchangers, solar with per-planet `solar-power`.
5. Done for global settings: one quality each for machines (crafting speed), modules (their effects, also in beacons) and beacons (distribution effectivity), stored as `qm`, `qd`, `qb`. The values per quality come from the running game through the helper mod. Mining drills get no speed from quality. Later: quality per recipe, and recycling loops for target quality.

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

## Phase 6a: Module structure

1. Done: `sorted()` stays in `src/core/` (the data layer needs it; `localeCompare` would order game order strings differently).
2. Done: `Matrix` lives in `src/core/simplex.ts`.
3. Done: `src/state/priority.ts` is the model, `src/ui/priority-view.ts` renders it on every `spec.display()` with keyed joins. URL weights of listed recipes are applied (they were ignored).
4. Done: `src/state/building-groups.ts`, `fuel-choice.ts` (`spec.fuel`), `energy.ts` (`EnergyContext`; `spec.getEnergyIngredients` and `getPowerUsage` delegate). `addTarget` and `removeTarget` are functions in `src/ui/target.ts`.
5. Keep `Rational`: exact fractions keep the simplex free of tolerances and the snapshot tests exact.

## Phase 8: Items with quality and recycling loops

Goal: targets with a quality, such as 60 legendary processing units per minute, solved through quality modules and recycling. Without a quality target and without a positive quality effect, the solution stays exactly as before (snapshot tests).

Mechanics from the 2.1 prototype docs: a machine with quality effect Q raises the product quality with probability Q × `next_probability` of the ingredient quality (1 for every quality in 2.1). After each raise, the reached quality raises once more with its `chain_probability` (0.1). Legendary has no next quality. Negative effects (speed modules) lower nothing, because `previous_probability` is 0. Fluids have no quality. Recycling returns the ingredients at the quality of the recycled item.

1. Done: qualities have `next`, `next_probability`, `chain_probability`; recipes have `allow_quality` (`Recipe.allowQuality`, mining recipes allow quality); modules have their `quality` effect.
2. Done: `qualityDistribution(from, effect)` in `src/data/quality.ts`, tested in `tests/quality.test.js`.
3. Done: `addQualityVariants()` creates `item.variant(q)` (key `<item>@<quality>`) for solid items not in orbit, and `recipe.variant(q)` for recipes that allow quality and have a solid ingredient. Variants are not in `spec.items` or `spec.recipes`; `spec` maps them to `recipe.base` for building, disable state and research. The graph takes variant recipes only as producers of variant items. A DisabledRecipe outside the priority list costs the maximum in the solver.
4. Done: `RecipeContext.getProducts(recipe)` spreads solid products by `ModuleSpec.qualityEffect()` (zero where the building's `allowed_effects` or the recipe exclude quality); solver, totals and cycle detection use it. `spec.producersOf(item)` adds lower-quality recipes that reach a variant. The legendary processing unit test with recycling solves in about 3 s (exact simplex on 236×412); moving the solver into a Web Worker would keep the page responsive.
5. Done: targets have a quality dropdown next to the item, stored as `<item>@<quality>` in `items=`. `spec.findItem()` and `spec.findRecipe()` resolve variant keys in URLs (targets, `modules=`, `rq=`).
6. Display: quality badge on item and recipe icons of variants.
7. Recycling: recycling recipes have variants like other recipes. Loops come from enabling them in the recipe toggles.
8. Snapshot scenarios for a legendary target with and without recycling; check solver time.

## Phase 7: Documentation

Done: README, FAQ and About describe the current feature set and limitations. No changelog; the git history serves as one.

## Handoff (state at the end of the last session)

Branch `develop`, everything committed, not pushed. Phases 0 to 7 and 6a are done; phase 5 has global quality only.

Next steps:

1. Push `develop` when the user asks, then merge into `main` for a release.
2. Phase 8 (items with quality and recycling loops), in progress. From phase 5 done: quality per recipe (`spec.recipeQuality`, `QualityContext.getQuality(recipe, kind)`, URL `rq=<recipe>:<machine>:<module>:<beacon>`, quality column in the factory table); reactor neighbour bonus (`reactors=<N>` for a 2×N block, `ReactorRecipe`, bonus enters `getProdEffect` with the depleted cell ignored by productivity).

Notes on phase 6: drag and drop in the Resources tab cannot be tested automatically (neither the Chrome extension nor headless Chrome start a native drag); ask the user to try it. Number inputs go through `readRational()` in `src/ui/number-input.ts`. `align.ts` stays because Chrome has no CSS decimal alignment.

Working notes:

- Game data: `npm run build-data -- --factorio /home/christian/Spiele/factorio --keep` keeps the dump; later runs can use `--dump <dir>`. Runtime values (item weights, daytime, quality speeds and module effects) come from the helper mod in `tools/lib/factorio.js`.
- After every result change: `npm run snapshot:record`, then compare old and new `tests/snapshots/factory.json` per scenario before committing.
- Browser checks with JS queries, screenshots only when the layout changed.
- Stop the dev server with `pkill -u $(id -u) -f "node.*[v]ite"` in a Bash call of its own; the pattern also matches a calling shell whose command contains `node` and `vite`.

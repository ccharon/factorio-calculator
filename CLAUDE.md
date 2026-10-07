# Factorio Calculator

Static web calculator for production ratios in Factorio 2.1 with the Space Age expansion. Fork of Kirk McDonald's calculator (Apache 2.0). Keep the copyright headers in existing files.

Repository: https://github.com/ccharon/factorio-calculator (remote `origin`).

## Scope

- Target game version: Factorio 2.1 with Space Age (`base`, `space-age`, `quality`, `recycler`, `elevated-rails`).
- Vanilla-only datasets, Factorio 1.1 support, "expensive" mode and other legacy code paths are out of scope and get removed.
- New game data always comes from the local game install, never from wikis or memory.

## Running

Node 20 or newer.

| Command | Effect |
|---------|--------|
| `npm install` | Installs all dependencies. |
| `npm start` | Vite dev server on http://127.0.0.1:8000/ with hot reload. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serves `dist/`. |

## Checks

| Command | Effect |
|---------|--------|
| `npm run lint` | Oxlint with type-aware rules (`.oxlintrc.json`), then `tools/check-dom-sinks.js`, which fails on `innerHTML`, `.html()`, `eval` and similar in `src/`. |
| `npm run typecheck` | `tsc` (TypeScript 7) with `tsconfig.json`. |
| `npm test` | Vitest: `tests/**/*.test.{js,ts}`. Known defects are marked with `test.fails`. |
| `npm run check` | Lint, type check, tests and build. Run before every commit. |
| `npm run test:browser` | Loads the page in a separate headless Chrome (`/usr/bin/google-chrome-stable`, override with `CHROME`) via `puppeteer-core`, prints the factory table and fails on JS errors. Takes `--dist` and an optional URL fragment. |
| `npm run snapshot:check` | Solves every scenario in `tests/snapshots/scenarios.js` in headless Chrome and compares the exact results with `tests/snapshots/factory.json`. Fails on any difference. `--dist` tests the production build. |
| `npm run snapshot:record` | Rewrites `tests/snapshots/factory.json`. Only run it when a result change is intended, and review the diff. |

Oxlint JS plugins are alpha and are not used.

## CI and deployment

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `.github/workflows/check.yml` | Push to `develop`, pull requests to `develop` and `main` | `npm run check`, then `snapshot:check --dist` in headless Chrome. |
| `.github/workflows/deploy.yml` | Push to `main` | `npm run check`, then force-pushes `dist/` as the root of the orphan branch `dist`. |

Dependabot (`.github/dependabot.yml`) opens weekly npm and action updates against `develop`.

## Local Factorio install

| Item | Value |
|------|-------|
| Path | `/home/christian/Spiele/factorio` |
| Version | 2.1.21, native arm64 |
| Binary | `bin/arm64/factorio` |
| Prototype data (Lua) | `data/base`, `data/space-age`, `data/quality`, `data/recycler` |
| Changelog | `data/changelog.txt` |

Do not modify the game directory. `tools/build-data.js` only reads it.

## Updating game data

```text
npm run build-data -- --factorio /home/christian/Spiele/factorio
```

The script runs the game three times headless (`--dump-data`, `--dump-icon-sprites`, `--dump-prototype-locale`) with a temporary config and mod directory. It writes `public/data/space-age-<version>.json` and `public/images/sprite-sheet-<hash>.png`. Afterwards, point `DATASET` in `src/main.js` to the new file, delete the old dataset and sprite sheet, and run `npm run check`.

| Option | Effect |
|--------|--------|
| `--factorio <dir>` | Game installation. Defaults to `FACTORIO_DIR`. |
| `--dump <dir>` | Reuse an existing `script-output` directory instead of running the game. |
| `--keep` | Keep the temporary dump and print its path. |

The dataset format is defined in `src/data/dataset.schema.json`. `tests/dataset.test.js` validates every `public/data/space-age-*.json` against it and checks that all item references resolve. Change the schema, `tools/lib/convert.js` and the loaders together.

## Architecture

| Area | Files |
|------|-------|
| Entry point | `index.html`, `src/main.js` |
| Core math and solver, no DOM | `src/core/`: `rational.ts`, `matrix.ts`, `simplex.ts`, `solve.ts` (with the `SolverContext` interface), `cycle.ts`, `totals.ts`, `sort.ts` |
| Game data loading | `src/data/`: `dataset.ts` (types of the dataset JSON), `dataset.schema.json`, `item.ts`, `recipe.ts`, `building.ts`, `module.ts`, `belt.ts`, `fuel.ts`, `planet.ts`, `group.ts`, `groups.ts` |
| State and URL settings | `src/state/`: `factory.ts` (`FactorySpecification`, global `spec`), `fragment.ts` (writes the settings string), `url-codec.ts` (parses and compresses the URL fragment), `priority.ts`, `align.ts` (number formatting) |
| UI | `src/ui/`: `display.js`, `target.js`, `settings.js`, `dropdown.js`, `module-dropdown.js`, `tooltip.ts`, `events.js`, `icon.ts`, `energy.ts`, `color.js`, `debug.js` |
| Visualizer | `src/visualize/`: `visualize.js`, `sankey.js`, `boxline.js`, `graph.js`, `circlepath.js`, `d3-sankey/` (modified copy of d3-sankey) |
| Styles | `src/styles/` |
| Static files | `public/`: dataset, sprite sheet, SVG icons, favicon. Copied unchanged into `dist/`. |
| Data generation | `tools/build-data.js` (CLI), `tools/lib/factorio.js` (runs the game), `tools/lib/convert.js` (data.raw to dataset), `tools/lib/sprites.js` (sprite sheet, uses `sharp`) |

Key facts:

- All math uses exact rationals (`src/core/rational.js`). Never use floats in solver code. Convert data values with `Rational.from_float_approximate`.
- Every setting must be handled in three places: its `render*` function in `src/ui/settings.js`, serialization in `src/state/fragment.js`, and the default constant. Shared URLs must keep working.
- `spec` is a module-level singleton, also exposed as `window.spec` for debugging.
- Recipes in 2.1 have a `categories` list. The 2.0 `category` field and the combined `x-or-y` categories no longer exist. The loader uses only the first category until phase 4 of `PLAN.md`.
- Product amounts in the dataset are expected values with probabilities and `extra_count_fraction` applied. `ignored_by_productivity` marks the part that productivity does not multiply.

## Conventions

- TypeScript and Vite, no UI framework. Every library comes from npm and is imported. No `<script>` tags for libraries, no inline scripts or event handler attributes in HTML.
- TypeScript rules for `src/` and new code:
  - No `any`, no non-null assertions (`!`), no `@ts-ignore`. Use `unknown` and narrow it, or write the type.
  - Explicit types on exported functions, public methods, class fields and module-level variables. Local variables may rely on inference when the initializer makes the type obvious.
  - Data from outside the program (dataset JSON, URL settings) is typed through interfaces in `src/data/dataset.ts` and `src/state/`, and checked where it enters.
  - `import type` for type-only imports. Imports of ported files use the `.ts` extension.
  - `readonly` for fields that never change after construction.
  - Compiler options are strict, including `noUncheckedIndexedAccess`. A missing map or array entry is handled explicitly, usually by throwing an `Error` with the missing key.
- Files in `src/` are JavaScript until their phase 3 port to TypeScript. Type-aware lint rules that need types are relaxed for `src/**/*.js` in `.oxlintrc.json`.
- 4-space indentation, no semicolons, double quotes. Match the surrounding file.
- Chrome is the only browser for testing: the Chrome extension for visual checks, `puppeteer-core` with the installed Chrome for automated checks.
- Documentation comments in every new or edited file:
  - Every class gets a comment above it that says what it represents.
  - Every exported function and every public method gets a comment above it that says what it does, its non-obvious parameters and what it returns.
  - A file without classes gets a short comment at the top that says what the module is for.
  - Add missing comments when you touch existing code. Code and comments must stay readable for a human reader.
- Build DOM with d3 or `document.createElement` and `.text()`/`textContent`. Never use `innerHTML`, `.html()` or string-built markup with data values.
- Commit messages: short imperative subject ending with a period, like the existing history.
- Work on `develop`. `main` receives merges from `develop` for releases. Push only when asked.
- Commit at every milestone (finished plan phase or step), after `npm run check` passes.
- No AI attribution anywhere in git: no `Co-Authored-By` trailer, no "Generated with" line, no other hint in commits, tags, branches or PR texts.

## Writing style

These rules apply to chat replies, commit messages, code comments, docstrings, READMEs and all other documentation, in every language. Keep reasoning thorough. The rules constrain phrasing only.

### Structure

- First sentence is the answer: the result, the verdict, or the change made. Explanation follows only if it would change what the reader does.
- No preamble. Do not announce what you are about to do.
- No closing summary that restates the reply.
- No "Would you like me to also...?" at the end.
- When asked to be shorter, remove content. Do not compress the same content into denser phrasing.

### Vocabulary

- Use ordinary, established technical vocabulary. Prefer the common word over the precise-sounding rare one.
- Never invent terminology or aphorisms, and never present a coined term as industry standard.
- Banned: load-bearing, hand-waving, the unlock, surface area (unless literally about API surface), first-class, reflexive hedging, honest framing, oracle, constellation, orchestrate (unless literally an orchestrator), leverage as a verb, "prose" when "text" is meant, "here's the thing", "the real question is", "here's where I'd push back", "worth noting", "it's important to understand".
- No metaphors invented on the spot.

### Sentences

- State what something is. Never open with what it is not. Avoid "It's not X, it's Y" entirely.
- Subject, verb, object. One idea per sentence. Split long sentences instead of joining them with dashes.
- Never use en or em dashes. Use a plain hyphen if a dash is unavoidable. Dashes as bullet markers are fine.
- No dash mid-sentence in place of a comma, colon, semicolon or parentheses.
- No rhetorical questions. No sentence fragments for emphasis. No three-item lists chosen for rhythm.

### Tone

- Reporting an error: state the error, state the fix, stop.
- Missing information: ask one specific question about what is missing.
- Alternatives: offer them briefly after answering the actual question, never instead of it.
- If the user is blunt or frustrated, fix the problem. Do not defend earlier answers.

### Code comments

- A comment describes the current state of the code, never its history. Git holds the history.
- Explain why, not what. No comment if the code already says what it does.
- When editing a comment, rewrite it for the new state. It should not grow.
- No measured performance numbers, dates, ticket numbers or author names unless asked.
- Standard length is one line. Two or three lines only for non-obvious constraints such as a protocol quirk, a race condition or an upstream bug.

### READMEs and documentation

- Structure: what it is, how to run it, how to configure it, known limitations. Nothing else unless asked.
- No history sections, migration narratives or design background.
- No marketing language. No claims that the project is clean, robust, elegant, powerful or modern.
- Configuration options go in a table: name, type, default, effect.
- One example per concept.

### Self-check

Before sending, check for dashes in running text, sentences that open with a negation, invented terms, a first sentence that is not the answer, and comments that mention how the code used to work.

# Factorio Calculator

Web calculator for production ratios in Factorio 2.1 with the Space Age expansion. It runs entirely in the browser from static files. Fork of [Kirk McDonald's calculator](https://github.com/KirkMcDonald/kirkmcdonald.github.io), licensed under Apache 2.0.

## Running

Requires Node 20 or newer.

```text
npm install
npm start
```

Then open http://127.0.0.1:8000/.

## Building

```text
npm run build
```

The static site is written to `dist/` and works from any directory on a web server.

## Updating game data

The dataset is generated from a local Factorio installation with Space Age. The game directory is only read.

```text
npm run build-data -- --factorio /path/to/factorio
```

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `--factorio` | path | `FACTORIO_DIR` | Game installation containing `bin/` and `data/`. |
| `--dump` | path | none | Reuse an existing `script-output` directory instead of running the game. |
| `--keep` | flag | off | Keep the temporary dump directory. |

The script writes `public/data/space-age-<version>.json` and `public/images/sprite-sheet-<hash>.png`. The format is defined in `src/data/dataset.schema.json`. Set `DATASET` in `src/main.ts` to the new file.

## Checks

| Command | Effect |
|---------|--------|
| `npm run lint` | Oxlint and a check for unsafe DOM APIs. |
| `npm run typecheck` | TypeScript type check. |
| `npm test` | Unit tests and dataset validation with Vitest. |
| `npm run check` | All of the above plus the build. |
| `npm run test:browser` | Loads the page in headless Chrome and fails on JS errors. |
| `npm run snapshot:check` | Compares solver results for fixed scenarios with `tests/snapshots/factory.json`. |

## Known limitations

- Each recipe uses the machines of its first crafting category only.
- Burner machines always burn the preferred chemical fuel, including biochambers, which use nutrients in the game.
- Quality, space platforms, research productivity and power generation are not modelled yet. See `PLAN.md`.

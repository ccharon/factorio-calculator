# Factorio Calculator

Web calculator for production ratios in Factorio 2.1 with the Space Age expansion. It runs in the browser from static files and computes exact building counts, belt counts and power use for one or more target items. Fork of [Kirk McDonald's calculator](https://github.com/KirkMcDonald/kirkmcdonald.github.io), licensed under Apache 2.0.

## Running

Requires Node 25 or newer.

```text
npm install
npm start
```

Then open http://127.0.0.1:8000/.

```text
npm run build
```

writes the static site to `dist/`. It works from any directory on a web server. `npm run preview` serves it locally.

## Configuration

All calculator settings are made on the page and stored in the URL fragment, so a link reproduces the calculation.

The dataset is generated from a local Factorio installation with Space Age. The game directory is only read.

```text
npm run build-data -- --factorio /path/to/factorio
```

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `--factorio` | path | `FACTORIO_DIR` | Game installation containing `bin/` and `data/`. |
| `--dump` | path | none | Reuse an existing `script-output` directory instead of running the game. |
| `--keep` | flag | off | Keep the temporary dump directory and print its path. |

The script writes `public/data/space-age-<version>.json` and `public/images/sprite-sheet-<hash>.png`. The format is defined in `src/data/dataset.schema.json`. Set `DATASET` in `src/main.ts` to the new file and delete the old dataset and sprite sheet.

## Checks

| Command | Effect |
|---------|--------|
| `npm run lint` | Oxlint and a check for unsafe DOM APIs. |
| `npm run typecheck` | TypeScript type check. |
| `npm test` | Unit tests and dataset validation with Vitest. |
| `npm run check` | All of the above plus the build. |
| `npm run test:browser` | Loads the page in headless Chrome and fails on JS errors. |
| `npm run snapshot:check` | Compares solver results for fixed scenarios with `tests/snapshots/factory.json`. |

The browser checks use `/usr/bin/google-chrome-stable`. Set `CHROME` to use another Chrome binary.

## Known limitations

- Quality is one global setting each for machines, modules and beacons. Quality per recipe and recycling loops for a target quality are not modelled.
- The nuclear reactor neighbour bonus is not modelled.
- Thruster fuel use does not depend on the thruster performance level. Targets set the fuel and oxidizer rates directly.
- Spoilage during transport is not modelled.
- Heating on Aquilo counts buildings only, not inserters, belts or pipes.
- Generators, heating towers and reactors are disabled until enabled in the recipe toggles. While one is enabled, electricity or heat is no longer a free import.
- Only Chrome is tested.

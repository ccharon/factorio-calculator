# Factorio Calculator

Web calculator for production ratios in Factorio 2.1 with the Space Age expansion. It runs entirely in the browser from static files. Fork of [Kirk McDonald's calculator](https://github.com/KirkMcDonald/kirkmcdonald.github.io), licensed under Apache 2.0.

## Running

Requires Node 20 or newer for the development server and tools.

```text
npm install
npm start
```

Then open http://127.0.0.1:8000/calc.html. Any other static HTTP server works as well.

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

The script writes `data/space-age-<version>.json` and `images/sprite-sheet-<hash>.png`. The format is defined in `data/schema.json`. Set `DATASET` in `init.js` to the new file.

## Checks

| Command | Effect |
|---------|--------|
| `npm run lint` | ESLint. |
| `npm test` | Unit tests and dataset validation. |
| `npm run check` | Both of the above. |
| `npm run test:browser` | Loads the page in headless Chrome and fails on JS errors. |

## Known limitations

- Each recipe uses the machines of its first crafting category only.
- Burner machines always burn the preferred chemical fuel, including biochambers, which use nutrients in the game.
- Quality, space platforms, research productivity and power generation are not modelled yet. See `PLAN.md`.

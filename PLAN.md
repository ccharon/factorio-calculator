# Plan

Goal: a calculator for Factorio 2.1 with Space Age only, with current game data, the Space Age mechanics, and a hardened code base. The migration from the upstream calculator is complete; the git history holds its phases.

## Decisions

| Topic | Decision |
|-------|----------|
| Data generation | In-repo Node script that runs the local Factorio install and builds the sprite sheet with `sharp`. |
| Languages | TypeScript everywhere: app, tests, tools and Vite config. No Python. |
| Build | TypeScript and Vite, no UI framework. All libraries come from npm. |
| Branches | `main` for releases, `develop` for work. A GitHub Action builds `main` into an orphan `dist` branch. |
| UI | The upstream look stays. |
| URL compatibility | Only URLs created by this version must stay stable. |
| Dev tooling | Oxlint with type-aware rules (no JS plugins, they are alpha), TypeScript 7, Vitest, puppeteer-core with Chrome. |

## Open items

1. Solve in a Web Worker, so that large quality targets with recycling (about 3 s for 60 legendary processing units per minute) do not block the page.
2. Spoilage of items of higher quality.
3. Rate labels of recipes with many products overlap in the visualizer.

## Working notes

- Game data: `npm run build-data -- --factorio /home/christian/Spiele/factorio --keep` keeps the dump; later runs can use `--dump <dir>`. Runtime values (item weights, daytime, quality speeds and module effects) come from the helper mod in `tools/lib/factorio.ts`. A converter change must leave the dataset byte-identical unless the change is intended.
- After every result change: `npm run snapshot:record`, then compare old and new `tests/snapshots/factory.json` per scenario before committing. `snapshot:check` names the differing entries.
- Browser checks with JS queries, screenshots only when the layout changed. Keyboard tests run with puppeteer; drag and drop needs a manual test by the user.
- Stop the dev server with `pkill -u $(id -u) -f "node.*[v]ite"` in a Bash call of its own; the pattern also matches a calling shell whose command contains `node` and `vite`.

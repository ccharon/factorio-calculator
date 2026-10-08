# In-game integration tests

Compare calculator results with factories built and run in the local game. Run manually with
`npm run ingame:check` after changes to the calculations, not in `npm run check` or CI.

## Design

- A helper mod builds each factory by script, isolated with infinity chests and pipes and an electric
  energy interface. The game runs headless for a fixed number of ticks; the mod writes measurements.
- A script loads the same scenario as URL fragment in the calculator (headless Chrome) and compares
  with a tolerance of one craft per measuring window, or a statistical tolerance for random results.

## Stages

Stage 1, Nauvis, single buildings:
1. [x] Assembler 1, 2, 3 with gears: crafting time / crafting speed.
2. [x] Assembler 3 with 4 productivity modules: products, not crafts.
3. [x] Assembler 3 with 1, 2, 4 beacons of speed modules: beacon profile and distribution effectivity.
4. [x] Stone furnace with coal: fuel per second.
5. [x] Electric mining drill with mining productivity research.
6. [x] Steel with high productivity research plus modules: +300% cap.
7. [x] Idle and working assembler on an electricity meter: drain 1/30, module power, 20% minimum.
8. [x] Boiler with steam engines: water and steam rates.

Stage 2, own derivations and exotic planets:
- Rocket silo over several launches (2434 tick pause, parts per launch).
- 2x2 nuclear reactor block with heat exchangers and turbines (neighbour bonus, 500 °C steam, cell time).
- Solar panel over a full day on Nauvis and Vulcanus (solar_factor, solar-power).
- Vulcanus: foundry casting steel (+50% productivity), big mining drill on tungsten.
- Gleba: agricultural tower with yumako (plot count from collision box and radius), biochamber nutrients.
- Aquilo: assembler without and with heating tower (heating_energy), fusion reactor and generator (plasma energy).

Stage 3, random results, quality, space:
- Fulgora: recycler with scrap (expected values).
- Assembler 3 with quality modules, many crafts (quality distribution, chain_probability).
- Space platform: chemical plant for thruster fuel and oxidizer, crusher for asteroid reprocessing.

## Handoff

Stage 1, stage 2 and the chain tests are done (44 factories, 37 match). The 7 differences are calculator
errors; the test setups are correct (discussed with the user on 2026-10-08). Next session: fix them in this order.

## Pending calculator fixes

1. DONE. Fusion reactor idle drain (test: fusion-reactor-generators).
   The game has no drain for the fusion reactor: it draws exactly power_input (10 MW). The calculator adds
   1/30 via Building.drain(). In the game only crafting machines have the drain; Miner already overrides
   drain() with zero. Give the fusion reactor building zero drain. Small change.
2. DONE: launch times measured by tools/mod/calculator-dump/rocket.lua, model in src/data/building.ts,
   8 silo tests match. Rocket silo cycle (tests: rocket-silo, rocket-silo-fast, rocket-silo-productivity).
   launchRate() in src/data/building.ts adds a fixed pause of 2434 ticks per launch. The game builds the
   next rocket during the launch: cycle = max(part build time, minimum launch cycle). Measured: normal
   silo 150 s per rocket (50 parts x 3 s, no pause); fast silo about 27 s per rocket, not 40.6 s.
   The minimum cycle depends on rocket silo prototype values that the dataset lacks (door_opening_speed,
   light_blinking_speed, times_to_blink, rocket rising, rocket_quick_relaunch_start_offset) and on the silo
   quality (*_speed_modifier_per_quality_level). Steps: add the values to tools/lib/convert.ts and the
   schema, derive the formula, check it with silos of several qualities in tests/ingame/rocket.
3. DONE: harvest energy measured by tools/mod/calculator-dump/agriculture.lua. Agricultural tower power (tests: gleba-yumako, gleba-jellystem, nauvis-tree).
   The calculator assumes 100 kW plus drain all the time. The prototype has energy_usage = 100 kW and
   crane_energy_usage = 100 kW; the game uses 29 to 63 kW on average, depending on crane activity (trees
   with long growth use least). First measure the power model in the game (towers with few plots, without
   seeds, per planting and harvest action), then model it in the calculator.
4. Solver with D-lava (no in-game test fails, but snapshots are affected).
   With ignore=iron-ore on Nauvis the solver casts iron from D-lava in a foundry instead of using the
   ignored ore. The snapshots aquilo, aquilo-fusion-power, aquilo-heating and space-platform-promethium
   import lava through D-lava. Check whether the priority of ignored items and of DisabledRecipes is right.

After each fix: npm run check, npm run snapshot:check (record only if the change is intended, compare
the diff), and npm run ingame:check -- --factorio /home/christian/Spiele/factorio --only <test>.

5. Planets: with several planets selected, the solver mixes them into one factory (for example iron from
   Gleba bacteria for red circuits in Vulcanus foundries). Needs an assignment of recipes to planets and
   transport rules (spoiling items cannot leave Gleba). Reported by the user on 2026-10-08.

Other open points: recycling loops in chain tests deadlock with waiting machines; the boiler water rate is
not measured; stage 3 (recycler with scrap on Fulgora, space platform) is not built yet.

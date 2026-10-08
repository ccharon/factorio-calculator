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
5. [ ] Electric mining drill with mining productivity research.
6. [ ] Steel with high productivity research plus modules: +300% cap.
7. [ ] Idle and working assembler on an electricity meter: drain 1/30, module power, 20% minimum.
8. [ ] Boiler with steam engines: water and steam rates.

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

Stage 1 items 1 to 4 done: `npm run ingame:check` with 8 factories, all match. Open question to the user:
one directory per test with its own Lua builder, for the stage 2 factories that need custom setups.

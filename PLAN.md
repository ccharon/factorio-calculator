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

Working on stage 2 (2026-10-08). User asked for extreme combined scenarios (quality, beacons, machine tiers,
planets) and for chain tests built from solver results (module "chains": the solver solution for a target
is built with script logistics, one pool per item, ceil(count) buildings, final recipe as integer building
count; no fluid intermediates). Decisions made during implementation are to be presented to the user.

Experiment findings (2.1.21):
- Rocket silo: one launch every 150 s = 50 parts x 3 s; the launch pause does not lengthen the cycle. The
  calculator adds 2434 ticks per launch. products_finished of a silo counts rockets, rocket_parts the current parts.
- Heating tower burns fuel all the time, also without consumers. Heat use is measured with a heat-interface
  whose temperature is reset every tick (specific heat 10 MJ/°C). Assembler 3 on Aquilo uses 100 kW heat.
- Nuclear 2x2 block: 120 MW heat per reactor (reactor temperature reset every tick).
- Agricultural tower: poles in the planting radius block cells; filling tower.energy every tick avoids poles.
  48 plants on artificial-yumako-soil. Harvest about 7.75/s over 600 s instead of 8/s (long window needed).
- Planet surfaces: game.planets[name].create_surface() with generate_with_lab_tiles; Vulcanus spawns a
  demolisher, destroy all entities after generation. New forces need recipes enabled.
- Fluids: infinity pipe at get_fluid_box_pipe_connections(i)[1].target_position, filter from get_fluid_filter(i).
- Fusion: reactor 6x6, generator 3x5, generators chain plasma through their top output.

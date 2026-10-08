-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Writes values that the game computes at runtime, such as item weights, to calculator-dump.json
-- when the map is created. Running the map then measures rocket launches, see rocket.lua.
-- tools/lib/factorio.ts installs this mod when it dumps the game data.

local rocket = require("rocket")

script.on_init(function()
    local weights = {}
    for name, item in pairs(prototypes.item) do
        weights[name] = item.weight
    end
    local daytime = {}
    for name, planet in pairs(game.planets) do
        local surface = planet.surface or planet.create_surface()
        daytime[name] = { dusk = surface.dusk, evening = surface.evening, morning = surface.morning, dawn = surface.dawn }
    end
    local qualities = {}
    local speeds = {}
    local energy = {}
    local modules = {}
    for qname, quality in pairs(prototypes.quality) do
        if not quality.hidden then
            qualities[qname] = { level = quality.level, default_multiplier = quality.default_multiplier }
        end
    end
    for name, entity in pairs(prototypes.get_entity_filtered({ { filter = "crafting-machine" } })) do
        speeds[name] = {}
        energy[name] = {}
        for qname in pairs(qualities) do
            speeds[name][qname] = entity.get_crafting_speed(qname)
            energy[name][qname] = entity.get_max_energy_usage(qname)
        end
    end
    for name, item in pairs(prototypes.get_item_filtered({ { filter = "type", type = "module" } })) do
        modules[name] = {}
        for qname in pairs(qualities) do
            modules[name][qname] = item.get_module_effects(qname)
        end
    end
    helpers.write_file("calculator-dump.json", helpers.table_to_json({
        item_weights = weights, daytime = daytime, qualities = qualities,
        crafting_speeds = speeds, max_energy_usage = energy, module_effects = modules,
    }))
    rocket.init()
end)

script.on_event(defines.events.on_tick, function(event)
    rocket.tick(event.tick)
end)

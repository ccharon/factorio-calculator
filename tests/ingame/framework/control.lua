-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Runs the in-game tests. Every test module (tests/<name>.lua in this mod, from
-- tests/ingame/<name>/build.lua) builds its factories. A factory with a planet stands on that
-- planet's surface, the others on a lab surface with default properties. Each factory gets its own
-- force, so research and electric networks stay separate. After its warmup the framework records
-- the counters of every factory, and at the end of its measuring window their differences. When all
-- windows have ended, it writes the results to ingame-results.json.
--
-- A test module is a table with these functions:
--   build(context, factory)  builds factory from its data and returns its state. context has the
--                            surface, the force, the x position and the start tick of the window.
--   supply(state)            optional, called every SUPPLY_INTERVAL ticks
--   tick(state)              optional, called every tick
--   counters(state)          returns the cumulative counters by name

local config = helpers.json_to_table(require("config"))

-- Distance between two factories along the x axis.
local SPACING = 50
local SUPPLY_INTERVAL = 60

local modules = {}
for _, test in pairs(config.tests) do
    modules[test.module] = require("tests/" .. test.module)
end

-- Returns the surface of planet, or the lab surface without planet. Planet surfaces get lab tiles,
-- and the creatures that map generation spawns, such as demolishers, are removed.
local function surface_of(planet)
    if planet == nil then
        local lab = game.get_surface("ingame-test") or game.create_surface("ingame-test")
        lab.generate_with_lab_tiles = true
        return lab
    end
    local surface = game.planets[planet].surface or game.planets[planet].create_surface()
    surface.generate_with_lab_tiles = true
    return surface
end

-- Generates the chunks around x on surface and removes the creatures that map generation placed
-- there. Destroying a demolisher also destroys its segments, so later entries may be invalid.
local function prepare_area(surface, x)
    surface.request_to_generate_chunks({ x, 0 }, 2)
    surface.force_generate_chunk_requests()
    for _, entity in pairs(surface.find_entities_filtered { area = { { x - SPACING / 2, -SPACING }, { x + SPACING / 2, SPACING } }, force = "enemy" }) do
        if entity.valid then
            entity.destroy()
        end
    end
end

-- Calls f for every factory.
local function each_factory(f)
    for _, factory in pairs(storage.factories) do
        f(factory, modules[factory.module])
    end
end

script.on_init(function()
    storage.factories = {}
    for _, test in pairs(config.tests) do
        for _, data in pairs(test.factories) do
            local x = #storage.factories * SPACING
            local surface = surface_of(data.planet)
            prepare_area(surface, x)
            local force = game.create_force("ingame-" .. data.name)
            -- A new force has only the recipes and qualities that need no research.
            for _, recipe in pairs(force.recipes) do
                recipe.enabled = true
            end
            for name, quality in pairs(prototypes.quality) do
                if not quality.hidden then
                    force.unlock_quality(name)
                end
            end
            local context = { surface = surface, force = force, x = x, start = data.warmup or config.warmup }
            local state = modules[test.module].build(context, data)
            -- Lightning on Fulgora and creatures must not destroy the factory.
            for _, entity in pairs(surface.find_entities_filtered { force = force }) do
                entity.destructible = false
            end
            table.insert(storage.factories, {
                module = test.module,
                name = data.name,
                start = data.warmup or config.warmup,
                finish = (data.warmup or config.warmup) + (data.window or config.window),
                state = state,
            })
        end
    end
    storage.results = {}
end)

script.on_event(defines.events.on_tick, function(event)
    local open = 0
    each_factory(function(factory, module)
        if module.tick then
            module.tick(factory.state)
        end
        if event.tick == factory.start then
            factory.start_counters = module.counters(factory.state)
        elseif event.tick == factory.finish then
            local counters = { seconds = (factory.finish - factory.start) / 60 }
            for key, value in pairs(module.counters(factory.state)) do
                counters[key] = value - (factory.start_counters[key] or 0)
            end
            storage.results[factory.name] = counters
        end
        if event.tick < factory.finish then
            open = open + 1
        end
    end)
    if open == 0 and not storage.written then
        helpers.write_file("ingame-results.json", helpers.table_to_json(storage.results))
        storage.written = true
    end
    if event.tick % SUPPLY_INTERVAL == 0 then
        each_factory(function(factory, module)
            if module.supply then
                module.supply(factory.state)
            end
        end)
    end
end)

-- A test entity that dies spoils the measurement, so the run stops with the cause.
script.on_event(defines.events.on_entity_died, function(event)
    local entity = event.entity
    if entity.force.name:find("^ingame%-") then
        local cause = event.cause and event.cause.name or "unknown cause"
        error(entity.name .. " of " .. entity.force.name .. " at " .. serpent.line(entity.position) .. " on " .. entity.surface.name .. " died: " .. cause)
    end
end)

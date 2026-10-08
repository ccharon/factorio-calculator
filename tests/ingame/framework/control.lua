-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Runs the in-game tests. Every test module (tests/<name>.lua in this mod, from
-- tests/ingame/<name>/build.lua) builds its factories on a lab surface. Each factory gets its own
-- force, so research and electric networks stay separate. After the warmup the framework records
-- the counters of every factory, and at the end of the measuring window it writes their
-- differences to ingame-results.json.
--
-- A test module is a table with these functions:
--   build(context, factory)  builds factory from its data and returns its state
--   supply(state)            optional, called every SUPPLY_INTERVAL ticks
--   tick(state)              optional, called every tick
--   counters(state)          returns the cumulative counters by name

local config = helpers.json_to_table(require("config"))

-- Distance between two factories along the x axis.
local SPACING = 40
local SUPPLY_INTERVAL = 60

local modules = {}
for _, test in pairs(config.tests) do
    modules[test.module] = require("tests/" .. test.module)
end

local function lab_surface()
    local surface = game.create_surface("ingame-test")
    surface.generate_with_lab_tiles = true
    surface.request_to_generate_chunks({ 0, 0 }, 1)
    local slots = 0
    for _, test in pairs(config.tests) do
        slots = slots + #test.factories
    end
    for i = 0, slots do
        surface.request_to_generate_chunks({ i * SPACING, 0 }, 1)
    end
    surface.force_generate_chunk_requests()
    return surface
end

-- Calls f for every factory with its module and state.
local function each_factory(f)
    for _, factory in pairs(storage.factories) do
        f(modules[factory.module], factory.state, factory.name)
    end
end

script.on_init(function()
    local surface = lab_surface()
    storage.factories = {}
    for _, test in pairs(config.tests) do
        for _, factory in pairs(test.factories) do
            local context = {
                surface = surface,
                force = game.create_force("ingame-" .. factory.name),
                x = #storage.factories * SPACING,
            }
            local state = modules[test.module].build(context, factory)
            table.insert(storage.factories, { module = test.module, name = factory.name, state = state })
        end
    end
end)

script.on_event(defines.events.on_tick, function(event)
    local start = config.warmup
    local finish = config.warmup + config.window
    each_factory(function(module, state)
        if module.tick then
            module.tick(state)
        end
    end)
    if event.tick == start then
        each_factory(function(module, state)
            state.start_counters = module.counters(state)
        end)
    elseif event.tick == finish then
        local results = {}
        each_factory(function(module, state, name)
            local counters = {}
            for key, value in pairs(module.counters(state)) do
                counters[key] = value - state.start_counters[key]
            end
            results[name] = counters
        end)
        helpers.write_file("ingame-results.json", helpers.table_to_json(results))
    end
    if event.tick % SUPPLY_INTERVAL == 0 then
        each_factory(function(module, state)
            if module.supply then
                module.supply(state)
            end
        end)
    end
end)

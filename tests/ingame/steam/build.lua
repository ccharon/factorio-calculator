-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- A boiler fed by an infinity pipe with water, two steam engines on its steam output, and an
-- energy interface that takes all the power. Counts the fuel energy of the boiler and the
-- electric energy of the engines.

local lib = require("lib")

-- Energy the load takes per tick, far more than the engines produce.
local LOAD_PER_TICK = 1e6

local steam = {}

function steam.build(context, factory)
    local surface, force, x = context.surface, context.force, context.x
    local north = defines.direction.north
    local boiler = surface.create_entity { name = factory.boiler, position = { x, 0 }, force = force, direction = north }

    -- The water input is the first fluid box of the boiler. Its connections point to where pipes go.
    local water = boiler.get_fluid_box_pipe_connections(1)[1].target_position
    local pipe = surface.create_entity { name = "infinity-pipe", position = water, force = force }
    pipe.set_infinity_pipe_filter { name = "water", percentage = 1 }

    -- Each engine connects to the steam output of the one below, the first to the boiler.
    local engines = {}
    for i = 1, factory.engines do
        local below = engines[i - 1] or boiler
        local box = below == boiler and 2 or 1
        local connections = below.get_fluid_box_pipe_connections(box)
        local output = connections[#connections].target_position
        local length = prototypes.entity[factory.engine].tile_height
        engines[i] = surface.create_entity { name = factory.engine, position = { output.x, output.y - length / 2 + 0.5 }, force = force, direction = north }
    end

    surface.create_entity { name = "substation", position = { x + 4, -4 }, force = force }
    local load = surface.create_entity { name = "electric-energy-interface", position = { x + 4, -1 }, force = force }
    load.power_production = 0
    load.power_usage = LOAD_PER_TICK
    load.electric_buffer_size = LOAD_PER_TICK

    return { factory = factory, boiler = boiler, engines = engines, generated = 0 }
end

function steam.supply(state)
    lib.supply_fuel(state, state.boiler, state.factory.fuel)
end

function steam.tick(state)
    for _, engine in pairs(state.engines) do
        state.generated = state.generated + engine.energy_generated_last_tick
    end
end

function steam.counters(state)
    return {
        fuel_energy = lib.fuel_energy(state, state.boiler, state.factory.fuel),
        electric_energy = state.generated,
    }
end

return steam

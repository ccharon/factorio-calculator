-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- A boiler or heat exchanger fed by an infinity pipe with water, a chain of steam engines or
-- turbines on its steam output, and an energy interface that takes all the power. A boiler burns
-- fuel, a heat exchanger gets heat from the script. Counts the fuel energy or heat and the electric
-- energy of the engines.

local lib = require("lib")

-- Energy the load takes per tick, far more than the engines produce.
local LOAD_PER_TICK = 1e8
-- Temperature that the script keeps a heat exchanger at, above the 500 °C of its steam.
local EXCHANGER_TEMPERATURE = 1000

local steam = {}

function steam.build(context, factory)
    local surface, force, x = context.surface, context.force, context.x
    local north = defines.direction.north
    local boiler = surface.create_entity { name = factory.boiler, position = { x, 0 }, force = force, direction = north }

    -- The first fluid box takes water, the second gives steam.
    local pipe = surface.create_entity { name = "infinity-pipe", position = lib.connection_target(boiler, 1, 1), force = force }
    pipe.set_infinity_pipe_filter { name = "water", percentage = 1 }

    -- Each engine connects its bottom connection to the steam output below it.
    local engines = {}
    local output = lib.connection_target(boiler, 2, 1)
    for i = 1, factory.engines do
        engines[i] = lib.place_connected(context, factory.engine, north, 1, 1, output)
        output = lib.connection_target(engines[i], 1, 2)
    end
    lib.power_load(context, { x + 5, -4 }, LOAD_PER_TICK)

    local heat = nil
    if not boiler.burner then
        heat = { entity = boiler, used = 0 }
    end
    return { factory = factory, boiler = boiler, engines = engines, heat = heat, generated = 0 }
end

function steam.supply(state)
    if state.factory.fuel then
        lib.supply_fuel(state, state.boiler, state.factory.fuel)
    end
end

function steam.tick(state)
    for _, engine in pairs(state.engines) do
        state.generated = state.generated + engine.energy_generated_last_tick
    end
    if state.heat then
        lib.track_heat(state.heat, EXCHANGER_TEMPERATURE)
    end
end

function steam.counters(state)
    local counters = { electric_energy = state.generated }
    if state.factory.fuel then
        counters.fuel_energy = lib.fuel_energy(state, state.boiler, state.factory.fuel)
    end
    if state.heat then
        counters.heat = state.heat.used
    end
    return counters
end

return steam

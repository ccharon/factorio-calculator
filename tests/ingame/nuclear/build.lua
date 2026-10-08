-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- A block of nuclear reactors in two rows that touch each other. The script takes their heat every
-- tick by resetting their temperature, so they always run. Counts the heat and the fuel energy of
-- all reactors.

local lib = require("lib")

-- Temperature the script resets the reactors to, well below their maximum.
local REACTOR_TEMPERATURE = 500

local nuclear = {}

function nuclear.build(context, factory)
    local size = prototypes.entity[factory.machine].tile_width
    local reactors = {}
    for row = 0, factory.rows - 1 do
        for column = 0, factory.columns - 1 do
            local position = { context.x + column * size, row * size }
            local reactor = context.surface.create_entity { name = factory.machine, position = position, force = context.force }
            table.insert(reactors, { entity = reactor, heat = { entity = reactor, used = 0 } })
        end
    end
    return { factory = factory, reactors = reactors }
end

function nuclear.supply(state)
    for _, reactor in pairs(state.reactors) do
        lib.supply_fuel(reactor, reactor.entity, state.factory.fuel)
    end
end

function nuclear.tick(state)
    for _, reactor in pairs(state.reactors) do
        lib.track_heat(reactor.heat, REACTOR_TEMPERATURE)
    end
end

function nuclear.counters(state)
    local counters = { heat = 0, fuel_energy = 0 }
    for _, reactor in pairs(state.reactors) do
        counters.heat = counters.heat + reactor.heat.used
        counters.fuel_energy = counters.fuel_energy + lib.fuel_energy(reactor, reactor.entity, state.factory.fuel)
    end
    return counters
end

return nuclear

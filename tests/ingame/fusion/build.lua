-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- A fusion reactor whose plasma runs a chain of fusion generators. Cold coolant comes from an
-- infinity pipe, and the hot coolant of the generators goes into empty infinity pipes. An energy
-- interface powers the reactor, and another one stores the energy of the generators. Counts the fuel
-- energy and electric energy of the reactor and the energy of the generators.

local lib = require("lib")

local fusion = {}

-- Fills fluid box box of entity through pipe connection index from a full infinity pipe, or drains
-- it into an empty one.
local function pipe(context, entity, box, index, fill)
    local filter = entity.get_fluid_filter(box)
    local infinity = context.surface.create_entity { name = "infinity-pipe", position = lib.connection_target(entity, box, index), force = context.force }
    if fill then
        infinity.set_infinity_pipe_filter { name = filter.fluid.name, percentage = 1, temperature = filter.minimum_temperature }
    else
        infinity.set_infinity_pipe_filter { name = filter.fluid.name, percentage = 0, mode = "exactly" }
    end
end

function fusion.build(context, factory)
    local north = defines.direction.north
    local reactor = context.surface.create_entity { name = factory.reactor, position = { context.x, 0 }, force = context.force, direction = north }
    -- The first fluid box takes the cold coolant, the second gives plasma.
    pipe(context, reactor, 1, 1, true)

    -- The first generator takes plasma from the top right of the reactor. Each generator passes
    -- plasma on through the top of its plasma box to the next one, which sits one tile to the left.
    -- The hot coolant leaves at the top right, where the next generator leaves room.
    local generators = {}
    local plasma = lib.connection_target(reactor, 2, 4)
    for i = 1, factory.generators do
        local generator = lib.place_connected(context, factory.generator, north, 1, 2, plasma)
        pipe(context, generator, 2, 2, false)
        generators[i] = generator
        plasma = lib.connection_target(generator, 1, 3)
    end
    -- Two separate electric networks: the generators feed a sink above the reactor, and a source
    -- below the reactor powers it. Neither substation reaches the other side.
    local sink = lib.power_sink(context, { context.x + 8, -14 })
    local source = lib.power_source(context, { context.x + 8, 8 })

    return { factory = factory, reactor = reactor, sink = sink, source = source }
end

function fusion.supply(state)
    lib.supply_fuel(state, state.reactor, state.factory.fuel)
end

function fusion.counters(state)
    return {
        fuel_energy = lib.fuel_energy(state, state.reactor, state.factory.fuel),
        reactor_energy = lib.electric_energy(state.source),
        electric_energy = state.sink.energy,
    }
end

return fusion

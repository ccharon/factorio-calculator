-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- A solar panel on a planet, with an energy interface that stores all its energy. The measuring
-- window is one day of the planet, so day and night count by their share. Counts the electric energy.

local lib = require("lib")

local solar = {}

function solar.build(context, factory)
    if context.surface.ticks_per_day ~= factory.window then
        error(factory.name .. ": a day has " .. context.surface.ticks_per_day .. " ticks, not " .. factory.window)
    end
    context.surface.create_entity { name = factory.machine, position = { context.x, 0 }, force = context.force }
    return { sink = lib.power_sink(context, { context.x + 3, 0 }) }
end

function solar.counters(state)
    return { electric_energy = state.sink.energy }
end

return solar

-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- A rocket silo that builds rocket parts and launches every rocket as soon as it is ready. Counts
-- the rocket parts, including those of the rocket in progress, and the launches.

local lib = require("lib")

local rocket = {}

function rocket.build(context, factory)
    local force = context.force
    if factory.research then
        -- A technology at level L + 1 has L levels researched.
        force.technologies[factory.research.technology].level = factory.research.level + 1
    end
    local silo = context.surface.create_entity { name = factory.machine, position = { context.x, 0 }, force = force }
    silo.set_recipe("rocket-part")
    lib.insert_modules(silo, factory.modules, factory.module_quality)
    local beacons = factory.beacons and lib.place_beacons(context, silo, factory.beacons, factory.module_quality) or {}
    local powered = { silo }
    for _, beacon in pairs(beacons) do
        table.insert(powered, beacon.entity)
    end
    return { silo = silo, launches = 0, power = lib.powered(powered) }
end

function rocket.supply(state)
    lib.supply_ingredients(state.silo, "rocket-part")
end

function rocket.tick(state)
    lib.track_power(state.power)
    if state.silo.rocket_silo_status == defines.rocket_silo_status.rocket_ready and state.silo.launch_rocket() then
        state.launches = state.launches + 1
    end
end

function rocket.counters(state)
    local silo = state.silo
    return {
        parts = state.launches * silo.prototype.rocket_parts_required + silo.rocket_parts,
        launches = state.launches,
    }
end

return rocket

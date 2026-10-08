-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Single machines from tests/ingame/machines/test.ts: an assembler or furnace that crafts one
-- recipe, or a mining drill on an ore patch. Counts products, fuel energy and electric energy.

local lib = require("lib")

-- Beacon positions relative to the machine: left, right, above, below.
local BEACON_OFFSETS = { { -3, 0 }, { 3, 0 }, { 0, -3 }, { 0, 3 } }
-- Resource amount of every ore tile, far more than a drill mines in a test.
local ORE_AMOUNT = 1000000

local machines = {}

-- Half the side of the ore patch around a drill, in tiles. It covers the mining area of every drill.
local PATCH_RADIUS = 3

-- Covers the area around a drill at x with ore.
local function ore_patch(context, resource, x)
    for dx = -PATCH_RADIUS, PATCH_RADIUS do
        for dy = -PATCH_RADIUS, PATCH_RADIUS do
            context.surface.create_entity { name = resource, position = { x + dx + 0.5, dy + 0.5 }, amount = ORE_AMOUNT }
        end
    end
end

function machines.build(context, factory)
    local surface, force, x = context.surface, context.force, context.x
    -- A new force has only the recipes that need no research.
    if force.recipes[factory.recipe] then
        force.recipes[factory.recipe].enabled = true
    end
    if factory.research then
        -- A technology at level L + 1 has L levels researched.
        force.technologies[factory.research.technology].level = factory.research.level + 1
    end
    if factory.mining_productivity then
        force.mining_drill_productivity_bonus = factory.mining_productivity
    end
    if factory.resource then
        ore_patch(context, factory.resource, x)
    end

    local machine = surface.create_entity { name = factory.machine, position = { x, 0 }, force = force }
    if machine.type == "assembling-machine" then
        machine.set_recipe(factory.recipe)
    end
    for _, module in pairs(factory.modules or {}) do
        machine.get_module_inventory().insert { name = module }
    end
    if factory.beacons then
        for i = 1, factory.beacons.count do
            local offset = BEACON_OFFSETS[i]
            local beacon = surface.create_entity { name = "beacon", position = { x + offset[1], offset[2] }, force = force }
            for _, module in pairs(factory.beacons.modules) do
                beacon.get_module_inventory().insert { name = module }
            end
        end
    end

    local chest = nil
    if factory.resource then
        chest = surface.create_entity { name = "infinity-chest", position = machine.drop_position, force = force }
    end
    return {
        factory = factory,
        machine = machine,
        chest = chest,
        mined = 0,
        source = lib.power_source(context, { x + 6, 0 }),
    }
end

function machines.supply(state)
    local factory, machine = state.factory, state.machine
    if state.chest then
        state.mined = state.mined + state.chest.get_item_count(factory.item)
        state.chest.clear_items_inside()
        return
    end
    if not factory.idle then
        lib.supply_ingredients(machine, factory.recipe)
    end
    if factory.fuel then
        lib.supply_fuel(state, machine, factory.fuel)
    end
    machine.get_output_inventory().clear()
end

function machines.counters(state)
    local factory = state.factory
    local products
    if state.chest then
        products = state.mined + state.chest.get_item_count(factory.item)
    else
        products = state.machine.products_finished
    end
    local counters = { products = products, electric_energy = lib.electric_energy(state.source) }
    if factory.fuel then
        counters.fuel_energy = lib.fuel_energy(state, state.machine, factory.fuel)
    end
    return counters
end

return machines

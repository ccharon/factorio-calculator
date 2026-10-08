-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Single machines from tests/ingame/machines/test.ts: a crafting machine that crafts one recipe, or
-- a mining drill on an ore patch. Machines, modules and beacons may have a quality. The script
-- powers the machine and the beacons, fluids come from infinity pipes, and on planets that require
-- heating each freezing entity gets its own heat interface. Counts products by quality, fuel energy,
-- and electric energy and heat of the machine and of the beacons separately.

local lib = require("lib")

-- Resource amount of every ore tile, far more than a drill mines in a test.
local ORE_AMOUNT = 1000000

local machines = {}

-- Covers the mining area of drill with ore.
local function ore_patch(context, drill, resource)
    local radius = math.ceil(prototypes.entity[drill].mining_drill_radius) + 1
    for dx = -radius, radius do
        for dy = -radius, radius do
            context.surface.create_entity { name = resource, position = { context.x + dx + 0.5, dy + 0.5 }, amount = ORE_AMOUNT }
        end
    end
end

-- Returns a free tile above or below the middle of machine. Tiles at the ends of its sides would
-- also touch the beacons in the corners.
local function machine_heat_tile(context, machine)
    local half = machine.prototype.tile_width / 2
    local x, y = machine.position.x, machine.position.y
    for distance = 0, math.floor(half) - 1 do
        for _, dx in pairs({ distance, -distance }) do
            for _, side in pairs({ -1, 1 }) do
                local position = { math.floor(x + dx) + 0.5, y + side * (half + 0.5) }
                if context.surface.can_place_entity { name = "heat-interface", position = position, force = context.force } then
                    return position
                end
            end
        end
    end
    error("no free tile next to " .. machine.name)
end

function machines.build(context, factory)
    local surface, force, x = context.surface, context.force, context.x
    if factory.research then
        -- A technology at level L + 1 has L levels researched.
        force.technologies[factory.research.technology].level = factory.research.level + 1
    end
    if factory.mining_productivity then
        force.mining_drill_productivity_bonus = factory.mining_productivity
    end
    if factory.resource then
        ore_patch(context, factory.machine, factory.resource)
    end

    local machine = surface.create_entity { name = factory.machine, position = { x, 0 }, force = force, quality = factory.machine_quality }
    if machine.type == "assembling-machine" then
        machine.set_recipe(factory.recipe)
    end
    lib.insert_modules(machine, factory.modules, factory.module_quality)
    local beacons = factory.beacons and lib.place_beacons(context, machine, factory.beacons, factory.module_quality) or {}
    local beacon_entities = {}
    for _, beacon in pairs(beacons) do
        table.insert(beacon_entities, beacon.entity)
    end
    local fluids = factory.resource and { [factory.fluid or ""] = true } or lib.fluid_ingredients(factory.recipe)
    lib.connect_fluids(context, machine, fluids, factory.fluid)

    local chest = nil
    if factory.resource then
        chest = surface.create_entity { name = "infinity-chest", position = machine.drop_position, force = force }
    end
    local heat, beacon_heat = nil, {}
    if surface.planet and surface.planet.prototype.entities_require_heating then
        heat = lib.heat_source(context, machine_heat_tile(context, machine))
        -- Each beacon gets heat on its outer side, away from the machine.
        for _, beacon in pairs(beacons) do
            local position = { beacon.entity.position.x + beacon.corner[1] * 2, beacon.entity.position.y }
            table.insert(beacon_heat, lib.heat_source(context, position))
        end
    end
    local electric = machine.electric_buffer_size ~= nil
    return {
        factory = factory,
        machine = machine,
        chest = chest,
        heat = heat,
        beacon_heat = beacon_heat,
        collected = {},
        power = lib.powered(electric and { machine } or {}),
        beacon_power = lib.powered(beacon_entities),
    }
end

-- The inventory that receives the products.
local function output(state)
    return state.chest and state.chest.get_inventory(defines.inventory.chest) or state.machine.get_output_inventory()
end

-- Adds the counted products in the output by quality to counts.
local function count_output(state, counts)
    for _, stack in pairs(output(state).get_contents()) do
        if stack.name == state.factory.item then
            local quality = stack.quality or "normal"
            counts[quality] = (counts[quality] or 0) + stack.count
        end
    end
end

function machines.supply(state)
    local factory, machine = state.factory, state.machine
    count_output(state, state.collected)
    output(state).clear()
    if state.chest then
        return
    end
    if not factory.idle then
        lib.supply_ingredients(machine, factory.recipe)
    end
    if factory.fuel then
        lib.supply_fuel(state, machine, factory.fuel)
    end
end

function machines.tick(state)
    -- The output holds one quality per product. A product of another quality blocks the machine
    -- until the output is empty, so machines with quality empty it every tick, as a fast inserter would.
    if state.factory.qualities then
        count_output(state, state.collected)
        output(state).clear()
    end
    lib.track_power(state.power)
    lib.track_power(state.beacon_power)
    if state.heat then
        lib.track_heat(state.heat)
    end
    for _, heat in pairs(state.beacon_heat) do
        lib.track_heat(heat)
    end
end

function machines.counters(state)
    local factory = state.factory
    local counts = {}
    for quality, count in pairs(state.collected) do
        counts[quality] = count
    end
    count_output(state, counts)

    local counters = { electric_energy = state.power.used, beacon_energy = state.beacon_power.used, products = 0 }
    for quality, count in pairs(counts) do
        counters["quality_" .. quality] = count
        counters.products = counters.products + count
    end
    if factory.fuel then
        counters.fuel_energy = lib.fuel_energy(state, state.machine, factory.fuel)
    end
    if state.heat then
        counters.heat = state.heat.used
        counters.beacon_heat = 0
        for _, heat in pairs(state.beacon_heat) do
            counters.beacon_heat = counters.beacon_heat + heat.used
        end
    end
    return counters
end

return machines

-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Builds the test factories of tests/ingame/factories.ts on a lab surface, keeps them supplied,
-- and writes what each one produced and burned during the measuring window to ingame-results.json.

local config = helpers.json_to_table(require("factories"))

local SURFACE = "ingame-test"
-- Distance between two factories along the x axis.
local SPACING = 20
-- Ticks between two supply rounds. Inputs hold enough for this time, and outputs do not fill up.
local SUPPLY_INTERVAL = 60
-- Fuel items kept in the fuel inventory.
local FUEL_STOCK = 5

-- Beacon positions relative to the machine: left, right, above, below.
local BEACON_OFFSETS = { { -3, 0 }, { 3, 0 }, { 0, -3 }, { 0, 3 } }

local function lab_surface()
    local surface = game.create_surface(SURFACE)
    surface.generate_with_lab_tiles = true
    surface.request_to_generate_chunks({ 0, 0 }, 8)
    surface.force_generate_chunk_requests()
    return surface
end

-- Gives the factory at x unlimited electricity through a substation next to it.
local function power(surface, x)
    local force = game.forces.player
    surface.create_entity { name = "substation", position = { x + 6, 0 }, force = force }
    local source = surface.create_entity { name = "electric-energy-interface", position = { x + 6, 3 }, force = force }
    source.power_production = 1e12
    source.electric_buffer_size = 1e12
end

local function build(surface, factory, x)
    local force = game.forces.player
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
    power(surface, x)
    return {
        name = factory.name,
        machine = machine,
        ingredients = prototypes.recipe[factory.recipe].ingredients,
        fuel = factory.fuel,
        fuel_inserted = 0,
    }
end

-- Tops up the ingredients and the fuel, and empties the output.
local function supply(state)
    local machine = state.machine
    for _, ingredient in pairs(state.ingredients) do
        local wanted = ingredient.amount * 20
        local present = machine.get_item_count(ingredient.name)
        if present < wanted then
            machine.insert { name = ingredient.name, count = wanted - present }
        end
    end
    if state.fuel then
        local inventory = machine.get_fuel_inventory()
        local missing = FUEL_STOCK - inventory.get_item_count(state.fuel)
        if missing > 0 then
            state.fuel_inserted = state.fuel_inserted + inventory.insert { name = state.fuel, count = missing }
        end
    end
    machine.get_output_inventory().clear()
end

-- The counters at one tick. Fuel energy counts the items that left the fuel inventory and the
-- energy left of the item that burns.
local function snapshot(state)
    local machine = state.machine
    local result = { products = machine.products_finished }
    if state.fuel then
        local fuel_value = prototypes.item[state.fuel].fuel_value
        local taken = state.fuel_inserted - machine.get_fuel_inventory().get_item_count(state.fuel)
        result.fuel_energy = taken * fuel_value - machine.burner.remaining_burning_fuel
    end
    return result
end

script.on_init(function()
    local surface = lab_surface()
    storage.factories = {}
    for i, factory in pairs(config.factories) do
        storage.factories[i] = build(surface, factory, (i - 1) * SPACING)
    end
end)

script.on_event(defines.events.on_tick, function(event)
    local start = config.warmup
    local finish = config.warmup + config.window
    if event.tick == start then
        for _, state in pairs(storage.factories) do
            state.start = snapshot(state)
        end
    elseif event.tick == finish then
        local results = {}
        for _, state in pairs(storage.factories) do
            local finish_snapshot = snapshot(state)
            results[state.name] = {
                products = finish_snapshot.products - state.start.products,
                fuel_energy = state.fuel and (finish_snapshot.fuel_energy - state.start.fuel_energy) or nil,
            }
        end
        helpers.write_file("ingame-results.json", helpers.table_to_json(results))
    end
    if event.tick % SUPPLY_INTERVAL == 0 then
        for _, state in pairs(storage.factories) do
            supply(state)
        end
    end
end)

-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Helpers that the test modules share: power, fuel and ingredient supply, and their counters.

local lib = {}

-- Energy in the buffer of an energy interface that supplies a factory. It is far more than any
-- factory uses, so the buffer never runs empty.
local SOURCE_ENERGY = 1e15
-- Fuel items kept in a fuel inventory.
local FUEL_STOCK = 5

-- Creates a substation at position, powered by an energy interface whose buffer the factory
-- drains. Returns the energy interface. Its energy drop is the electric energy the factory used.
function lib.power_source(context, position)
    local surface, force = context.surface, context.force
    surface.create_entity { name = "substation", position = position, force = force }
    local source = surface.create_entity { name = "electric-energy-interface", position = { position[1], position[2] + 3 }, force = force }
    source.power_production = 0
    source.power_usage = 0
    source.electric_buffer_size = 2 * SOURCE_ENERGY
    source.energy = SOURCE_ENERGY
    return source
end

-- Returns the electric energy that the factory drew from its source so far.
function lib.electric_energy(source)
    return SOURCE_ENERGY - source.energy
end

-- Keeps FUEL_STOCK items of fuel in the fuel inventory of entity and counts the inserted items in state.
function lib.supply_fuel(state, entity, fuel)
    local inventory = entity.get_fuel_inventory()
    local missing = FUEL_STOCK - inventory.get_item_count(fuel)
    if missing > 0 then
        state.fuel_inserted = (state.fuel_inserted or 0) + inventory.insert { name = fuel, count = missing }
    end
end

-- Returns the fuel energy that entity burned so far: the items that left its fuel inventory,
-- minus the energy left of the item that burns.
function lib.fuel_energy(state, entity, fuel)
    local taken = (state.fuel_inserted or 0) - entity.get_fuel_inventory().get_item_count(fuel)
    return taken * prototypes.item[fuel].fuel_value - entity.burner.remaining_burning_fuel
end

-- Keeps enough of every ingredient of recipe in entity for the next supply round.
function lib.supply_ingredients(entity, recipe)
    for _, ingredient in pairs(prototypes.recipe[recipe].ingredients) do
        local wanted = ingredient.amount * 20
        local present = entity.get_item_count(ingredient.name)
        if present < wanted then
            entity.insert { name = ingredient.name, count = wanted - present }
        end
    end
end

return lib

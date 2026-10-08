-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Helpers that the test modules share: power, heat, fluids, fuel and ingredients, and their counters.

local lib = {}

-- Energy in the buffer of an energy interface that supplies a factory. It is far more than any
-- factory uses, so the buffer never runs empty.
local SOURCE_ENERGY = 1e15
-- Fuel items kept in a fuel inventory.
local FUEL_STOCK = 5
-- Temperature that heat sources keep. It is above what freezing entities need.
local HEAT_TEMPERATURE = 500

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

-- Electric entities that get their energy from the script instead of an electric network, so that
-- no pole has to reach them. lib.track_power() fills their buffers every tick and counts the energy
-- they used.
function lib.powered(entities)
    return { entities = entities, used = 0 }
end

-- Adds the energy that the entities of power used since the last tick, and fills their buffers.
-- Call it every tick.
function lib.track_power(power)
    for _, entity in pairs(power.entities) do
        local size = entity.electric_buffer_size
        power.used = power.used + (size - entity.energy)
        entity.energy = size
    end
end

-- Creates an energy interface at position that takes up to per_tick joules from the electric
-- network every tick, as load for generators.
function lib.power_load(context, position, per_tick)
    local surface, force = context.surface, context.force
    surface.create_entity { name = "substation", position = position, force = force }
    local load = surface.create_entity { name = "electric-energy-interface", position = { position[1], position[2] + 3 }, force = force }
    load.power_production = 0
    load.power_usage = per_tick
    load.electric_buffer_size = per_tick
end

-- Creates an energy interface at position with an empty buffer that stores all energy of the
-- electric network, for producers that do not report what they generate, such as solar panels.
-- Its energy is the energy it received.
function lib.power_sink(context, position)
    local surface, force = context.surface, context.force
    surface.create_entity { name = "substation", position = position, force = force }
    local sink = surface.create_entity { name = "electric-energy-interface", position = { position[1], position[2] + 3 }, force = force }
    sink.power_production = 0
    sink.power_usage = 0
    sink.electric_buffer_size = 2 * SOURCE_ENERGY
    sink.energy = 0
    return sink
end

-- Creates a heat interface at position that keeps HEAT_TEMPERATURE. lib.track_heat() counts the
-- heat that neighbouring entities draw from it.
function lib.heat_source(context, position)
    local source = context.surface.create_entity { name = "heat-interface", position = position, force = context.force }
    source.set_heat_setting { temperature = HEAT_TEMPERATURE, mode = "exactly" }
    return { entity = source, used = 0 }
end

-- Adds the heat drawn from the entity of heat since the last tick to heat.used, and fills the entity
-- up again. Call it every tick. With target above the current temperature it counts heat that the
-- entity produced instead, as for a reactor.
function lib.track_heat(heat, target)
    local entity = heat.entity
    local temperature = target or HEAT_TEMPERATURE
    local specific_heat = entity.prototype.heat_buffer_prototype.specific_heat
    heat.used = heat.used + math.abs(temperature - entity.temperature) * specific_heat
    entity.temperature = temperature
end

-- Connects every fluid box of entity to an infinity pipe. Boxes of fluids in ingredients get a full
-- pipe, the others an empty one that takes all output. A box without filter, such as the input of
-- a mining drill, gets the fluid fallback if given.
function lib.connect_fluids(context, entity, ingredients, fallback)
    for i = 1, entity.fluids_count do
        local filter = entity.get_fluid_filter(i)
        local name = filter and filter.fluid.name or fallback
        local connections = entity.get_fluid_box_pipe_connections(i)
        if name and #connections > 0 then
            local pipe = context.surface.create_entity { name = "infinity-pipe", position = connections[1].target_position, force = context.force }
            if ingredients[name] then
                local temperature = filter and filter.minimum_temperature or prototypes.fluid[name].default_temperature
                pipe.set_infinity_pipe_filter { name = name, percentage = 1, temperature = temperature }
            else
                pipe.set_infinity_pipe_filter { name = name, percentage = 0, mode = "exactly" }
            end
        end
    end
end

-- Creates entity name facing direction so that pipe connection index of its fluid box box lies on
-- position, the target position of a connection of another entity. Both then share their fluid.
function lib.place_connected(context, name, direction, box, index, position)
    -- A probe at a free spot gives the offset of the connection from the entity position.
    local probe = context.surface.create_entity { name = name, position = { context.x, 40 }, force = context.force, direction = direction }
    local connection = probe.get_fluid_box_pipe_connections(box)[index]
    local dx, dy = connection.position.x - probe.position.x, connection.position.y - probe.position.y
    probe.destroy()
    local entity = context.surface.create_entity { name = name, position = { position.x - dx, position.y - dy }, force = context.force, direction = direction }
    if not entity then
        error("cannot place " .. name .. " at " .. serpent.line(position))
    end
    return entity
end

-- Returns the target position of pipe connection index of fluid box box of entity.
function lib.connection_target(entity, box, index)
    return entity.get_fluid_box_pipe_connections(box)[index].target_position
end

-- Returns the fluid names among the ingredients of recipe.
function lib.fluid_ingredients(recipe)
    local fluids = {}
    for _, ingredient in pairs(prototypes.recipe[recipe].ingredients) do
        if ingredient.type == "fluid" then
            fluids[ingredient.name] = true
        end
    end
    return fluids
end

-- Corners of a machine, as signs of the x and y offset.
local CORNERS = { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }

-- Places beacons at the corners of machine, where they leave the fluid connections on its sides
-- free. Returns the beacons and their corners.
function lib.place_beacons(context, machine, beacons, module_quality)
    local offset = (machine.prototype.tile_width + prototypes.entity["beacon"].tile_width) / 2
    local placed = {}
    for i = 1, beacons.count do
        local corner = CORNERS[i]
        local position = { machine.position.x + corner[1] * offset, machine.position.y + corner[2] * offset }
        local beacon = context.surface.create_entity { name = "beacon", position = position, force = context.force, quality = beacons.quality }
        lib.insert_modules(beacon, beacons.modules, module_quality)
        table.insert(placed, { entity = beacon, corner = corner })
    end
    return placed
end

-- Resource amount of every ore tile, far more than a drill mines in a test.
local ORE_AMOUNT = 1000000

-- Covers the mining area of a drill at position with ore.
function lib.ore_patch(context, drill, resource, position)
    local radius = math.ceil(prototypes.entity[drill].mining_drill_radius) + 1
    for dx = -radius, radius do
        for dy = -radius, radius do
            context.surface.create_entity { name = resource, position = { position[1] + dx + 0.5, position[2] + dy + 0.5 }, amount = ORE_AMOUNT }
        end
    end
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

-- Keeps enough of every item ingredient of recipe in entity for the next supply round.
function lib.supply_ingredients(entity, recipe)
    for _, ingredient in pairs(prototypes.recipe[recipe].ingredients) do
        if ingredient.type == "item" then
            local wanted = math.max(ingredient.amount * 20, 1)
            local present = entity.get_item_count(ingredient.name)
            if present < wanted then
                entity.insert { name = ingredient.name, count = wanted - present }
            end
        end
    end
end

-- Inserts modules, a list of module names, of quality into the module inventory of entity.
function lib.insert_modules(entity, modules, quality)
    for _, module in pairs(modules or {}) do
        entity.get_module_inventory().insert { name = module, quality = quality or "normal" }
    end
end

return lib

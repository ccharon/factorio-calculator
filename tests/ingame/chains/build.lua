-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Production chains from tests/ingame/chains/test.ts. Every recipe of a solver result gets its
-- machines in a grid. The script moves items between them through one pool per item and quality:
-- it takes the products out of the machines while the pool is below its limit, gives the machines
-- their ingredients from the pools, supplies raw items without limit, takes the target items at the
-- target rate and removes items that no machine uses. Machines with spare capacity fill their own
-- outputs, so the produced items count when they leave the pool: taken by a machine, delivered as
-- target or removed as surplus. Also counts the raw items, the fuel energy and the electric energy.

local lib = require("lib")

-- Grid of the machines: cell size in tiles and cells per row. A cell holds a machine of up to 5x5
-- tiles with beacons at its corners.
local CELL = 12
local COLUMNS = 4
-- Crafts of ingredients that the script keeps in each machine.
local BUFFER_CRAFTS = 5
-- Supply rounds of consumption that a pool holds before machines have to wait.
local POOL_ROUNDS = 3

local chains = {}

local function key_of(stack)
    return stack.name .. "@" .. (stack.quality or "normal")
end

local function add(counts, key, amount)
    counts[key] = (counts[key] or 0) + amount
end

function chains.build(context, factory)
    -- A scenario that the test could not prepare has no solution and gets no machines.
    local solution = factory.solution or { machines = {}, raw = {}, targets = {}, produced = {} }
    local surface, force = context.surface, context.force

    -- The grid can reach beyond the area that the framework generated.
    local total = 0
    for _, group in pairs(solution.machines) do
        total = total + group.count
    end
    for row = 0, math.ceil(total / COLUMNS) do
        surface.request_to_generate_chunks({ context.x + COLUMNS * CELL / 2, row * CELL }, 2)
    end
    surface.force_generate_chunk_requests()

    local machines, powered, beacon_entities = {}, {}, {}
    local consumers = {}
    for _, group in pairs(solution.machines) do
        for _ = 1, group.count do
            local index = #machines
            local position = { context.x + (index % COLUMNS) * CELL, math.floor(index / COLUMNS) * CELL }
            if group.resource then
                lib.ore_patch(context, group.machine, group.resource, position)
            end
            local machine = surface.create_entity { name = group.machine, position = position, force = force, quality = group.machine_quality }
            if machine.type == "assembling-machine" then
                machine.set_recipe(group.recipe, group.recipe_quality)
            end
            lib.insert_modules(machine, group.modules, group.module_quality)
            if group.beacons then
                for _, beacon in pairs(lib.place_beacons(context, machine, group.beacons, group.module_quality)) do
                    table.insert(beacon_entities, beacon.entity)
                end
            end
            -- A drill drops its products into a chest with one slot, which the script empties like an
            -- output. A full chest stops the drill.
            local output = machine.get_output_inventory()
            if group.resource then
                lib.connect_fluids(context, machine, { [group.fluid or ""] = true }, group.fluid)
                local chest = surface.create_entity { name = "wooden-chest", position = machine.drop_position, force = force }
                output = chest.get_inventory(defines.inventory.chest)
                output.set_bar(2)
            else
                lib.connect_fluids(context, machine, lib.fluid_ingredients(group.recipe))
            end
            if machine.electric_buffer_size then
                table.insert(powered, machine)
            end
            table.insert(machines, { entity = machine, group = group, output = output })
        end
        for _, ingredient in pairs(group.ingredients) do
            consumers[key_of(ingredient)] = true
        end
        if group.fuel then
            consumers[group.fuel .. "@normal"] = true
        end
    end

    local raw, targets = {}, {}
    for _, item in pairs(solution.raw) do
        raw[item.key] = { rate = item.rate, allowance = 0 }
    end
    for _, item in pairs(solution.targets) do
        targets[item.key] = { rate = item.rate, allowance = 0 }
    end
    -- The pool limit of an item is a few rounds of what the solution consumes of it.
    local limits = {}
    for _, item in pairs(solution.produced) do
        limits[item.key] = math.max(10, item.rate * POOL_ROUNDS)
    end

    return {
        machines = machines,
        raw = raw,
        targets = targets,
        consumers = consumers,
        limits = limits,
        pool = {},
        used = {},
        start = context.start,
        raw_inserted = {},
        delivered = {},
        surplus = {},
        power = lib.powered(powered),
        beacon_power = lib.powered(beacon_entities),
        round = 0,
    }
end

-- Moves the products of every machine into the pools. A full pool keeps the products of the
-- machine's own quality in its output, so that the machine waits. Products of other qualities,
-- which quality modules make on the side, and items that no machine and no target takes always
-- leave, as an inserter would take them.
local function collect(state)
    for _, machine in pairs(state.machines) do
        local output = machine.output
        for _, stack in pairs(output.get_contents()) do
            local key = key_of(stack)
            local limited = (state.consumers[key] or state.targets[key]) and (stack.quality or "normal") == machine.group.recipe_quality
            if not limited or (state.pool[key] or 0) < (state.limits[key] or 0) then
                add(state.pool, key, stack.count)
                output.remove { name = stack.name, quality = stack.quality, count = stack.count }
            end
        end
    end
end

-- Takes target items at their rate and removes the items that no machine uses. The allowance of a
-- target holds at most a few rounds, so that a target that went short while the chain started does
-- not take what the chain needs for itself, such as bioflux for the nutrients that fuel it.
local function sink(state)
    for key, count in pairs(state.pool) do
        local target = state.targets[key]
        if target then
            target.allowance = math.min(target.allowance + target.rate, target.rate * POOL_ROUNDS)
            local taken = math.min(count, math.floor(target.allowance))
            target.allowance = target.allowance - taken
            state.pool[key] = count - taken
            add(state.delivered, key, taken)
            add(state.used, key, taken)
        elseif not state.consumers[key] then
            state.pool[key] = 0
            add(state.surplus, key, count)
            add(state.used, key, count)
        end
    end
end

-- Takes up to count of key for a machine from the pool. A raw item makes up the rest. Raw items
-- that the chain also produces, such as plates from recycling, come from outside only at the rate
-- of the solution, because the solver uses them as an expensive last resort. During the warmup,
-- fuel also comes from outside, because a chain that makes its own fuel cannot start without it.
local function take(state, key, count, fuel)
    local taken = math.min(count, state.pool[key] or 0)
    state.pool[key] = (state.pool[key] or 0) - taken
    add(state.used, key, taken)
    local raw = state.raw[key]
    if fuel and not raw and taken < count and game.tick < state.start then
        return count
    end
    if raw and taken < count then
        local supplied = count - taken
        if state.limits[key] then
            supplied = math.min(supplied, math.floor(raw.allowance))
            raw.allowance = raw.allowance - supplied
        end
        add(state.raw_inserted, key, supplied)
        taken = taken + supplied
    end
    return taken
end

-- Gives every machine its ingredients and fuel. The first machine changes every round, so that
-- machines share a short pool. A machine whose products are still in its output waits, so that
-- spare machines do not use more raw items, fuel and power than the chain needs.
local function feed(state)
    for _, raw in pairs(state.raw) do
        raw.allowance = raw.allowance + raw.rate
    end
    local count = #state.machines
    for offset = 0, count - 1 do
        local machine = state.machines[(state.round + offset) % count + 1]
        local entity, group = machine.entity, machine.group
        if next(machine.output.get_contents()) ~= nil then
            goto continue
        end
        for _, ingredient in pairs(group.ingredients) do
            local wanted = math.ceil(ingredient.amount * BUFFER_CRAFTS)
            local missing = wanted - entity.get_item_count { name = ingredient.name, quality = ingredient.quality }
            if missing > 0 then
                local taken = take(state, key_of(ingredient), missing)
                if taken > 0 then
                    entity.insert { name = ingredient.name, quality = ingredient.quality, count = taken }
                end
            end
        end
        if group.fuel then
            local inventory = entity.get_fuel_inventory()
            local missing = 5 - inventory.get_item_count(group.fuel)
            if missing > 0 then
                local taken = take(state, group.fuel .. "@normal", missing, true)
                if taken > 0 then
                    machine.fuel_inserted = (machine.fuel_inserted or 0) + inventory.insert { name = group.fuel, count = taken }
                end
            end
        end
        ::continue::
    end
    state.round = state.round + 1
end

function chains.supply(state)
    collect(state)
    sink(state)
    feed(state)
end

function chains.tick(state)
    lib.track_power(state.power)
    lib.track_power(state.beacon_power)
end

function chains.counters(state)
    local counters = { electric_energy = state.power.used, beacon_energy = state.beacon_power.used, fuel_energy = 0 }
    -- Raw items still in the machines count as not consumed yet.
    local in_machines = {}
    for _, machine in pairs(state.machines) do
        local entity = machine.entity
        for _, ingredient in pairs(machine.group.ingredients) do
            local key = key_of(ingredient)
            if state.raw[key] then
                add(in_machines, key, entity.get_item_count { name = ingredient.name, quality = ingredient.quality })
            end
        end
        if machine.group.fuel then
            counters.fuel_energy = counters.fuel_energy + lib.fuel_energy(machine, entity, machine.group.fuel)
        end
    end
    for key, count in pairs(state.used) do
        counters["produced:" .. key] = count
    end
    -- Raw items in the machines may come from the pool too, so the stock changes count only for
    -- items that are only supplied. The window is long enough for the rest.
    for key, count in pairs(state.raw_inserted) do
        counters["consumed:" .. key] = count - (state.limits[key] and 0 or (in_machines[key] or 0))
    end
    for key, count in pairs(state.delivered) do
        counters["delivered:" .. key] = count
    end
    for key, count in pairs(state.surplus) do
        counters["surplus:" .. key] = count
    end
    return counters
end

return chains

-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- An agricultural tower on soil that its plant grows on, with enough seeds. The script powers it,
-- because a pole in its planting area would take the place of a plant. Counts the harvest.

local lib = require("lib")

local agriculture = {}

function agriculture.build(context, factory)
    local tower_prototype = prototypes.entity[factory.machine]
    -- The planting area reaches radius grid cells beyond the cell of the tower.
    local reach = (tower_prototype.agricultural_tower_radius + 1) * tower_prototype.growth_grid_tile_size
    local tiles = {}
    for dx = -reach, reach do
        for dy = -reach, reach do
            table.insert(tiles, { name = factory.soil, position = { context.x + dx, dy } })
        end
    end
    context.surface.set_tiles(tiles)

    local tower = context.surface.create_entity { name = factory.machine, position = { context.x, 0 }, force = context.force }
    return { factory = factory, tower = tower, harvested = 0, power = lib.powered({ tower }) }
end

function agriculture.supply(state)
    local tower, factory = state.tower, state.factory
    if tower.get_item_count(factory.seed) < 10 then
        tower.insert { name = factory.seed, count = 10 }
    end
    local output = tower.get_output_inventory()
    state.harvested = state.harvested + output.get_item_count(factory.item)
    output.clear()
end

function agriculture.tick(state)
    lib.track_power(state.power)
end

function agriculture.counters(state)
    return {
        products = state.harvested + state.tower.get_output_inventory().get_item_count(state.factory.item),
        electric_energy = state.power.used,
    }
end

return agriculture

-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Agricultural towers on soil that their plant grows on, with enough seeds. The crane energy of one
-- tower depends on random planting spots, so the factory has factory.towers towers in a column and
-- counts their sum. The script powers them, because a pole in a planting area would take the place of a
-- plant. Counts the harvest.

local lib = require("lib")

local agriculture = {}

function agriculture.build(context, factory)
    local tower_prototype = prototypes.entity[factory.machine]
    -- The planting area reaches radius grid cells beyond the cell of the tower.
    local reach = (tower_prototype.agricultural_tower_radius + 1) * tower_prototype.growth_grid_tile_size
    local spacing = 2 * reach + 2
    local towers = {}
    for i = 0, factory.towers - 1 do
        local y = i * spacing
        context.surface.request_to_generate_chunks({ context.x, y }, 1)
        context.surface.force_generate_chunk_requests()
        local tiles = {}
        for dx = -reach, reach do
            for dy = -reach, reach do
                table.insert(tiles, { name = factory.soil, position = { context.x + dx, y + dy } })
            end
        end
        context.surface.set_tiles(tiles)
        for _, entity in pairs(context.surface.find_entities_filtered { area = { { context.x - reach, y - reach }, { context.x + reach, y + reach } } }) do
            entity.destroy()
        end
        table.insert(towers, context.surface.create_entity { name = factory.machine, position = { context.x, y }, force = context.force })
    end
    return { factory = factory, towers = towers, harvested = 0, power = lib.powered(towers) }
end

function agriculture.supply(state)
    local factory = state.factory
    for _, tower in pairs(state.towers) do
        if tower.get_item_count(factory.seed) < 10 then
            tower.insert { name = factory.seed, count = 10 }
        end
        local output = tower.get_output_inventory()
        state.harvested = state.harvested + output.get_item_count(factory.item)
        output.clear()
    end
end

function agriculture.tick(state)
    lib.track_power(state.power)
end

function agriculture.counters(state)
    local products = state.harvested
    for _, tower in pairs(state.towers) do
        products = products + tower.get_output_inventory().get_item_count(state.factory.item)
    end
    return { products = products, electric_energy = state.power.used }
end

return agriculture

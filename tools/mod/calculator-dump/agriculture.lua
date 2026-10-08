-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Measures the electric energy that every agricultural tower uses for one harvest and the
-- replanting. A tower draws power only while its crane works, and the crane's path depends on the
-- tower geometry and on random planting spots, so the energy is an average over many harvests.
-- The crane works the same way for every plant, so all towers plant yumako on Gleba.

local agriculture = {}

-- Towers per prototype. Their harvests average out the random planting spots.
local TOWERS = 16
-- The towers plant all plots, harvest them once to reach the steady state, then the measuring
-- window covers three harvests per plot.
local WINDOW_START = 36000
local WINDOW_END = 90000
local SEED = "yumako-seed"
local SOIL = "artificial-yumako-soil"
-- Distance between two towers, more than their planting area.
local SPACING = 40

-- Builds TOWERS towers of every agricultural tower prototype on soil.
function agriculture.init()
    local surface = game.planets.gleba.surface or game.planets.gleba.create_surface()
    surface.generate_with_lab_tiles = true
    storage.agriculture = { towers = {}, results = {} }
    local index = 0
    for name, prototype in pairs(prototypes.get_entity_filtered({ { filter = "type", type = "agricultural-tower" } })) do
        storage.agriculture.results[name] = { energy = 0, harvests = 0 }
        local reach = (prototype.agricultural_tower_radius + 1) * prototype.growth_grid_tile_size
        for _ = 1, TOWERS do
            local position = { (index % 8) * SPACING, math.floor(index / 8) * SPACING }
            index = index + 1
            surface.request_to_generate_chunks(position, math.ceil(reach / 32) + 1)
            surface.force_generate_chunk_requests()
            local tiles = {}
            for dx = -reach, reach do
                for dy = -reach, reach do
                    table.insert(tiles, { name = SOIL, position = { position[1] + dx, position[2] + dy } })
                end
            end
            surface.set_tiles(tiles)
            for _, entity in pairs(surface.find_entities_filtered { position = position, radius = reach * 1.5 }) do
                entity.destroy()
            end
            local tower = surface.create_entity { name = name, position = position, force = "player" }
            storage.agriculture.towers[tower.unit_number] = { entity = tower, name = name }
        end
    end
end

-- Counts the harvests of the measuring window.
function agriculture.mined(event)
    local data = storage.agriculture
    local tower = data and data.towers[event.tower.unit_number]
    if tower and event.tick > WINDOW_START and event.tick <= WINDOW_END then
        data.results[tower.name].harvests = data.results[tower.name].harvests + 1
    end
end

-- Runs every tick: powers the towers, counts their energy and writes calculator-agriculture.json at the end.
function agriculture.tick(tick)
    local data = storage.agriculture
    if not data or tick > WINDOW_END then
        return
    end
    for _, tower in pairs(data.towers) do
        local entity = tower.entity
        local used = entity.electric_buffer_size - entity.energy
        entity.energy = entity.electric_buffer_size
        if tick > WINDOW_START then
            data.results[tower.name].energy = data.results[tower.name].energy + used
        end
        if entity.get_item_count(SEED) < 5 then
            entity.insert { name = SEED, count = 5 }
        end
        entity.get_output_inventory().clear()
    end
    if tick == WINDOW_END then
        local out = {}
        for name, result in pairs(data.results) do
            out[name] = { harvest_energy = result.energy / result.harvests }
        end
        helpers.write_file("calculator-agriculture.json", helpers.table_to_json(out))
    end
end

return agriculture

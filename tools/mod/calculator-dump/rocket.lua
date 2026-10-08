-- SPDX-FileCopyrightText: 2026 Christian Charon
-- SPDX-License-Identifier: Apache-2.0

-- Measures the launch sequence of every rocket silo at every quality, in ticks. The silos craft
-- nothing: the script sets their rocket parts at chosen moments and launches every ready rocket.
-- The animation speeds that quality changes, such as rocket rising and engine starting, add up to
-- times that cannot be derived from the prototype, so they are measured.
--
-- Per silo and quality the result has:
--   flight      launch until the rocket has left and the silo can take the next one
--   quick       next rocket appearing in the open silo until its launch
--   lights      lights blinking before the doors close
--   reopen      ranges {first, last} of ticks into the blinking: parts ready at tick k of a range
--               open the doors at k + 1, parts ready before a range open them at its first tick + 1,
--               and parts ready after the last range wait for the end of the blinking
--   doors       doors closing
--   full        rocket created in the closed silo until its launch

local rocket = {}

local status = defines.rocket_silo_status
-- Ticks into the blinking at which probe silos get their parts. Larger than any blinking time.
local PROBE_TICKS = 240
-- Distance between two silos.
local SPACING = 10
-- Probe silos per row.
local ROW = 40

-- Returns every rocket silo prototype with every unhidden quality.
local function variants()
    local list = {}
    for name in pairs(prototypes.get_entity_filtered({ { filter = "type", type = "rocket-silo" } })) do
        for quality, prototype in pairs(prototypes.quality) do
            if not prototype.hidden then
                table.insert(list, { name = name, quality = quality })
            end
        end
    end
    return list
end

-- Creates a silo with full parts on the next free spot.
local function place(surface, name, quality)
    local index = storage.rocket.placed
    storage.rocket.placed = index + 1
    local position = { (index % ROW) * SPACING, math.floor(index / ROW) * SPACING }
    local silo = surface.create_entity { name = name, position = position, force = "player", quality = quality }
    silo.set_recipe("rocket-part")
    silo.rocket_parts = silo.prototype.rocket_parts_required
    return silo
end

-- Builds the silos. A "quick" silo gets its parts back right after each launch, a "full" silo only
-- when its doors are closed, and probe silo k gets them k ticks into the blinking.
function rocket.init()
    local surface = game.surfaces.nauvis
    surface.generate_with_lab_tiles = true
    local list = variants()
    local count = #list * (PROBE_TICKS + 2)
    surface.request_to_generate_chunks({ ROW * SPACING / 2, count / ROW * SPACING / 2 }, math.ceil(math.max(ROW, count / ROW) * SPACING / 64) + 1)
    surface.force_generate_chunk_requests()
    for _, entity in pairs(surface.find_entities_filtered { force = "enemy" }) do
        entity.destroy()
    end

    storage.rocket = { placed = 0, silos = {}, results = {} }
    for _, variant in pairs(list) do
        local key = variant.name .. "/" .. variant.quality
        storage.rocket.results[key] = { name = variant.name, quality = variant.quality, reopen = {} }
        local function add(kind, probe)
            table.insert(storage.rocket.silos, { kind = kind, probe = probe, key = key, entity = place(surface, variant.name, variant.quality), ticks = {} })
        end
        add("quick")
        add("full")
        for k = 1, PROBE_TICKS do
            add("probe", k)
        end
    end
end

-- Launches a ready rocket and records the state changes of a silo after its first launch, which
-- starts from a silo built with parts. Returns true once the silo has measured all it needs.
local function step(silo, tick, result)
    local entity = silo.entity
    local ticks = silo.ticks
    local required = entity.prototype.rocket_parts_required
    if entity.rocket_silo_status == status.rocket_ready and entity.launch_rocket() then
        if ticks.launch == nil then
            ticks.launch = tick
            if silo.kind == "quick" then
                entity.rocket_parts = required
            end
        elseif silo.kind == "quick" then
            result.flight = ticks.opened - ticks.launch
            result.quick = tick - ticks.opened
            return true
        else
            result.lights = ticks.closing - ticks.blink
            result.doors = ticks.closed - ticks.closing
            result.full = tick - ticks.created
            return true
        end
    end

    local state = entity.rocket_silo_status
    if state == silo.last then
        if silo.kind == "probe" and ticks.blink and tick == ticks.blink + silo.probe then
            entity.rocket_parts = required
        end
        return false
    end
    silo.last = state
    if ticks.launch == nil then
        return false
    end

    if state == status.lights_blinking_close then
        ticks.blink = tick
    elseif silo.kind == "probe" and ticks.blink then
        -- The blinking ends with closing doors, or with the next rocket in the open silo.
        if state ~= status.doors_closing then
            result.reopen[silo.probe] = tick - ticks.blink
        end
        return true
    elseif state == status.doors_opened then
        ticks.opened = tick
    elseif state == status.doors_closing then
        ticks.closing = tick
    elseif state == status.building_rocket then
        ticks.closed = tick
        entity.rocket_parts = required
    elseif state == status.lights_blinking_open then
        -- The rocket appears one tick before, in a create_rocket state that the script does not see.
        ticks.created = tick - 1
    end
    return false
end

-- Runs every tick. Writes calculator-rocket.json when all silos are done.
function rocket.tick(tick)
    local data = storage.rocket
    if not data or data.written then
        return
    end
    local open = false
    for _, silo in pairs(data.silos) do
        if not silo.done then
            silo.entity.energy = silo.entity.electric_buffer_size
            silo.done = step(silo, tick, data.results[silo.key])
            open = open or not silo.done
        end
    end
    if open then
        return
    end

    local out = {}
    for _, result in pairs(data.results) do
        local reopen = {}
        for k = 1, result.lights - 1 do
            if result.reopen[k] == k + 1 then
                local last = reopen[#reopen]
                if last and last[2] == k - 1 then
                    last[2] = k
                else
                    table.insert(reopen, { k, k })
                end
            end
        end
        -- Every probe must follow the ranges, or the model in src/data/building.ts misses a case.
        for k = 1, result.lights - 1 do
            local expected = result.lights
            for _, range in ipairs(reopen) do
                if k <= range[2] then
                    expected = math.max(k, range[1]) + 1
                    break
                end
            end
            if result.reopen[k] ~= expected then
                error(result.name .. "/" .. result.quality .. ": parts at blinking tick " .. k .. " reopen at " .. tostring(result.reopen[k]) .. ", expected " .. expected)
            end
        end
        out[result.name] = out[result.name] or {}
        out[result.name][result.quality] = {
            flight = result.flight, quick = result.quick, lights = result.lights, reopen = reopen, doors = result.doors, full = result.full,
        }
    end
    helpers.write_file("calculator-rocket.json", helpers.table_to_json(out))
    data.written = true
end

return rocket

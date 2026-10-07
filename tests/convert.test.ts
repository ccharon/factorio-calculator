/*Copyright 2026 Christian Charon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/

import assert from "node:assert/strict"
import { test } from "vitest"
import { convert, normalizeProduct } from "../tools/lib/convert.ts"
import type { RawData } from "../tools/lib/raw.ts"

test("normalizeProduct folds probabilities into the expected amount", () => {
    assert.deepEqual(normalizeProduct({ type: "item", name: "a", amount: 2 }), { type: "item", name: "a", amount: 2 })
    assert.equal(normalizeProduct({ name: "a", amount: 1, independent_probability: 0.1 }).amount, 0.1)
    assert.equal(normalizeProduct({ name: "a", amount_min: 1, amount_max: 3 }).amount, 2)
    assert.equal(normalizeProduct({ name: "a", amount: 0, extra_count_fraction: 0.5 }).amount, 0.5)
    assert.equal(normalizeProduct({ name: "a", amount: 1, shared_probability: { min: 0.007, max: 1 } }).amount, 0.993)
})

test("normalizeProduct keeps productivity and fluid details", () => {
    const p = normalizeProduct({ type: "fluid", name: "heavy-oil", amount: 90, ignored_by_productivity: 25, temperature: 500 })
    assert.deepEqual(p, { type: "fluid", name: "heavy-oil", amount: 90, ignored_by_productivity: 25, temperature: 500 })
})

test("normalizeProduct applies the probability to the part ignored by productivity", () => {
    const p = normalizeProduct({ type: "item", name: "pentapod-egg", amount: 2, probability: 0.5, ignored_by_productivity: 1 })
    assert.deepEqual(p, { type: "item", name: "pentapod-egg", amount: 1, ignored_by_productivity: 0.5 })
})

// Smallest data.raw that exercises every section of convert().
function minimalRaw(): RawData {
    return {
        "item-group": { intermediate: { name: "intermediate", order: "c" } },
        "item-subgroup": {
            raw: { name: "raw", group: "intermediate", order: "a" },
            fluid: { name: "fluid", group: "intermediate", order: "b" },
        },
        item: {
            "iron-ore": { name: "iron-ore", type: "item", subgroup: "raw", stack_size: 50 },
            "iron-plate": { name: "iron-plate", type: "item", subgroup: "raw", stack_size: 100, order: "b" },
            coal: { name: "coal", type: "item", subgroup: "raw", stack_size: 50, fuel_value: "4MJ", fuel_categories: ["chemical"] },
            seed: { name: "seed", type: "item", subgroup: "raw", stack_size: 10, plant_result: "bush", spoil_ticks: 60, spoil_result: "coal" },
            "parameter-0": { name: "parameter-0", type: "item", stack_size: 1, parameter: true },
        },
        fluid: { water: { name: "water", subgroup: "fluid", default_temperature: 15, heat_capacity: "2kJ" } },
        recipe: {
            "iron-plate": {
                name: "iron-plate", categories: ["smelting"], energy_required: 3.2,
                ingredients: [{ type: "item", name: "iron-ore", amount: 1 }],
                results: [{ type: "item", name: "iron-plate", amount: 1 }],
            },
            "recipe-unknown": { name: "recipe-unknown", ingredients: {}, results: {} },
        },
        furnace: {
            "stone-furnace": {
                name: "stone-furnace", crafting_categories: ["smelting"], crafting_speed: 1, energy_usage: "90kW",
                energy_source: { type: "burner", fuel_categories: ["chemical"] },
                surface_conditions: [{ property: "pressure", min: 10 }],
            },
        },
        "assembling-machine": {},
        "rocket-silo": {},
        "mining-drill": {},
        "offshore-pump": {},
        boiler: {},
        "transport-belt": {},
        beacon: {
            beacon: { name: "beacon", energy_usage: "480kW", distribution_effectivity: 1.5, module_slots: 2, allowed_effects: ["speed"], profile: [1, 0.5] },
        },
        module: {},
        "agricultural-tower": {},
        planet: {
            home: {
                name: "home", order: "a", surface_properties: { pressure: 1000 },
                map_gen_settings: {
                    autoplace_controls: { "home-plants": {} },
                    autoplace_settings: {
                        entity: { settings: { "iron-ore": {} } },
                        tile: { settings: { deepwater: {} } },
                    },
                },
                asteroid_spawn_definitions: [{ type: "asteroid-chunk", asteroid: "rock-chunk" }, { asteroid: "big-ice" }],
            },
        },
        asteroid: {
            "big-ice": { name: "big-ice", dying_trigger_effect: [{ type: "create-entity", entity_name: "small-ice" }] },
            "small-ice": { name: "small-ice", dying_trigger_effect: { type: "create-asteroid-chunk", asteroid_name: "ice-chunk" } },
        },
        "asteroid-chunk": { "rock-chunk": { name: "rock-chunk" }, "ice-chunk": { name: "ice-chunk" } },
        surface: { "space-platform": { name: "space-platform", order: "z", surface_properties: { pressure: 0 } } },
        tile: { deepwater: { name: "deepwater", fluid: "water" } },
        resource: { "iron-ore": { name: "iron-ore", minable: { mining_time: 1, result: "iron-ore" } } },
        plant: {
            bush: {
                name: "bush",
                growth_ticks: 600,
                autoplace: { control: "home-plants" },
                minable: { results: [{ type: "item", name: "iron-ore", amount: 5 }] },
            },
        },
        "surface-property": { pressure: { name: "pressure", default_value: 1000 } },
        "utility-constants": { default: { name: "default", default_rocket_lift_weight: 1000000 } },
        "utility-sprites": {
            default: { name: "default", clock: { filename: "__core__/clock.png" }, empty_module_slot: { filename: "__core__/slot.png" } },
        },
    }
}

// Returns list[i], or fails the test if it is missing.
function at<T>(list: readonly T[], i: number): T {
    const x = list[i]
    assert.ok(x !== undefined, `no entry ${i}`)
    return x
}

test("convert builds every dataset section", () => {
    const d = convert(minimalRaw(), { recipe: { names: { "iron-plate": "Iron plate" } } }, "2.1.0", { item_weights: { coal: 2000 } })
    assert.equal(d.version, "2.1.0")
    assert.deepEqual(d.items.map(i => i.key), ["coal", "iron-ore", "iron-plate", "seed", "water"])
    assert.deepEqual(d.recipes.map(r => r.key), ["iron-plate"])
    assert.equal(at(d.recipes, 0).localized_name.en, "Iron plate")
    assert.equal(at(d.recipes, 0).order, "b", "order falls back to the main product")
    assert.deepEqual(d.fuel, [{ item_key: "coal", categories: ["chemical"], value: 4000000 }])
    assert.equal(d.rocket_lift_weight, 1000000)
    assert.equal(d.items.find(i => i.key === "coal")?.weight, 2000)
    assert.deepEqual(d.spoilage, [{ from_item: "seed", to_item: "coal", time: 60 }])
    assert.equal(at(d.fluids, 0).heat_capacity, 2000)
    assert.equal(at(d.crafting_machines, 0).energy_usage, 90000)
    assert.equal(at(d.crafting_machines, 0).energy_source?.fuel_category, "chemical")
    assert.deepEqual(at(d.planets, 0).resources, { resource: ["iron-ore"], offshore: ["water"], plants: ["bush"], asteroid: [] })
    assert.deepEqual(at(d.planets, 1).resources.asteroid, ["ice-chunk", "rock-chunk"])
    assert.deepEqual(at(d.resources, 0).results, [{ type: "item", name: "iron-ore", amount: 1 }])
    assert.equal(at(d.plants, 0).seed, "seed")
    assert.equal(d.sprites.extra["clock"]?.icon_ref, "file:__core__/clock.png")
})

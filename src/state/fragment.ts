/*Copyright 2019-2021 Kirk McDonald
Copyright 2026 Christian Charon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Serializes the calculator state into the settings string of the URL fragment. The parser
// lives in url-codec.ts; the settings are applied in ui/settings.js.

import { Rational } from "../core/rational.ts"
import { sorted } from "../core/sort.ts"
import type { Item } from "../data/item.ts"
import type { Module } from "../data/module.ts"
import {
    DEFAULT_TAB, currentTab, DEFAULT_VISUALIZER, visualizerType, DEFAULT_RENDER, visualizerRender, visualizerElectricity, isDefaultVisDirection, visualizerDirection,
} from "../ui/events.ts"
import { DEFAULT_TITLE, DEFAULT_COLOR_SCHEME, colorScheme } from "../ui/settings.ts"
import { DEFAULT_RATE, DEFAULT_RATE_PRECISION, DEFAULT_COUNT_PRECISION, DEFAULT_FORMAT } from "./align.ts"
import { spec, DEFAULT_BELT } from "./factory.ts"

const hundred = Rational.from_float(100)

function moduleKey(module: Module | null): string {
    return module === null ? "null" : module.shortName()
}

/**
 * Returns the current state as a settings string such as "rate=s&items=coal:r:1". Values equal
 * to their defaults are left out.
 *
 * @param excludeTitle - Leave out the page title.
 * @param overrideTab - Tab to store instead of the current one.
 * @param targets - Item rates to store instead of the current build targets.
 */
export function formatSettings(excludeTitle = false, overrideTab?: string, targets?: ReadonlyArray<readonly [Item, Rational]>): string {
    const parts: string[] = []
    const add = (name: string, value: string): void => {
        parts.push(`${name}=${value}`)
    }
    if (!excludeTitle && document.title !== DEFAULT_TITLE) {
        add("title", encodeURIComponent(document.title))
    }

    const tab = overrideTab ?? currentTab
    if (tab !== DEFAULT_TAB) {
        add("tab", tab)
    }
    if (colorScheme.key !== DEFAULT_COLOR_SCHEME) {
        add("c", colorScheme.key)
    }

    const format = spec.format
    if (format.rateName !== DEFAULT_RATE) {
        add("rate", format.rateName)
    }
    if (format.ratePrecision !== DEFAULT_RATE_PRECISION) {
        add("rp", String(format.ratePrecision))
    }
    if (format.countPrecision !== DEFAULT_COUNT_PRECISION) {
        add("cp", String(format.countPrecision))
    }
    if (format.displayFormat !== DEFAULT_FORMAT) {
        add("vf", format.displayFormat.charAt(0))
    }
    if (!spec.miningProd.isZero()) {
        add("mprod", spec.miningProd.mul(hundred).toString())
    }
    const research = spec.research.filter(r => (spec.researchLevels.get(r) ?? 0) > 0).map(r => `${r.key}:${spec.researchLevels.get(r) ?? 0}`)
    if (research.length > 0) {
        add("rprod", research.join(","))
    }

    const buildings: string[] = []
    for (const group of spec.buildings.values()) {
        if (group.building !== group.getDefault()) {
            buildings.push(`${group.key}:${group.building.key}`)
        }
    }
    if (buildings.length > 0) {
        add("buildings", buildings.join(","))
    }

    const normal = spec.qualities[0]
    for (const [key, quality] of [["qm", spec.machineQuality], ["qd", spec.moduleQuality], ["qb", spec.beaconQuality]] as const) {
        if (quality !== normal) {
            add(key, quality.key)
        }
    }

    if (spec.belt.key !== DEFAULT_BELT) {
        add("belt", spec.belt.key)
    }
    const fuels = new Set<string>()
    for (const [category, fuel] of spec.fuel.selected) {
        if (fuel !== spec.fuel.getDefault(category)) {
            fuels.add(fuel.key)
        }
    }
    if (fuels.size > 0) {
        add("fuel", Array.from(fuels).join(","))
    }

    if (spec.defaultModule !== null) {
        add("dm", spec.defaultModule.shortName())
    }
    if (spec.secondaryDefaultModule !== null) {
        add("dm2", spec.secondaryDefaultModule.shortName())
    }
    if (!spec.isDefaultDefaultBeacon()) {
        add("db", spec.defaultBeacon.map(moduleKey).join(":"))
    }
    if (!spec.defaultBeaconCount.isZero()) {
        add("dbc", spec.defaultBeaconCount.toDecimal(0))
    }

    if (visualizerType !== DEFAULT_VISUALIZER) {
        add("vt", visualizerType)
    }
    if (visualizerRender !== DEFAULT_RENDER) {
        add("vr", visualizerRender)
    }
    if (!isDefaultVisDirection()) {
        add("vd", visualizerDirection)
    }
    if (visualizerElectricity) {
        add("ve", "1")
    }

    let targetStrings: string[]
    if (targets) {
        targetStrings = targets.map(([item, rate]) => `${item.key}:r:${rate.mul(format.rateFactor).toString()}`)
    } else {
        targetStrings = spec.buildTargets.map(target => {
            if (!target.changedBuilding) {
                return `${target.itemKey}:r:${target.rate.mul(format.rateFactor).toString()}`
            }
            let s = `${target.itemKey}:f:${target.buildingInput?.value ?? ""}`
            if (target.recipe !== null && target.recipe !== target.defaultRecipe) {
                s += `:${target.recipe.key}`
            }
            return s
        })
    }
    add("items", targetStrings.join(","))

    if (spec.ignore.size > 0) {
        add("ignore", Array.from(spec.ignore, item => item.key).join(","))
    }
    if (!spec.isDefaultPlanet()) {
        add("planet", sorted(spec.selectedPlanets, p => p.order).map(p => p.key).join(","))
    }
    const { disable, enable } = spec.getNetDisable()
    if (disable.size > 0) {
        add("disable", Array.from(disable, r => r.key).join(","))
    }
    if (enable.size > 0) {
        add("enable", Array.from(enable, r => r.key).join(","))
    }

    const moduleSettings: string[] = []
    for (const [recipe, moduleSpec] of spec.spec) {
        if (!spec.lastTotals?.rates.has(recipe)) {
            continue
        }
        const defaultModule = spec.getDefaultModule(recipe)
        const modules = moduleSpec.modules.filter(m => m !== defaultModule).map(moduleKey)
        let beacon = ""
        const [b0, b1] = moduleSpec.beaconModules
        if (b0 !== spec.defaultBeacon[0] || b1 !== spec.defaultBeacon[1] || !moduleSpec.beaconCount.equal(spec.defaultBeaconCount)) {
            beacon = `${moduleKey(b0)}:${moduleKey(b1)}:${moduleSpec.beaconCount.toString()}`
        }
        if (modules.length > 0 || beacon !== "") {
            let s = `${recipe.key}:${modules.join(":")}`
            if (beacon !== "") {
                s += `;${beacon}`
            }
            moduleSettings.push(s)
        }
    }
    if (moduleSettings.length > 0) {
        add("modules", moduleSettings.join(","))
    }

    if (!spec.isDefaultPriority()) {
        const levels: string[] = []
        for (const level of spec.priority) {
            levels.push(Array.from(level, ({ recipe, weight }) => `${recipe.key}=${weight.toString()}`).join(","))
        }
        add("priority", levels.join(";"))
    }
    if (spec.debug) {
        add("debug", "1")
    }
    return parts.join("&")
}

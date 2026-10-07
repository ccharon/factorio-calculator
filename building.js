/*Copyright 2019-2021 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
import { powerRepr } from "./display.js"
import { spec } from "./factory.js"
import { Icon } from "./icon.js"
import { Rational, zero, one } from "./rational.js"

let thirty = Rational.from_float(30)

// A machine that crafts recipes, such as an assembler or furnace. Base class for miners, pumps
// and the rocket silo.
class Building {
    // power is the working power in W. fuel is the fuel category of a burner machine, or null.
    constructor(key, name, col, row, categories, speed, prodBonus, moduleSlots, power, fuel) {
        this.key = key
        this.name = name
        this.categories = new Set(categories)
        this.speed = speed
        this.prodBonus = prodBonus
        this.moduleSlots = moduleSlots
        this.power = power
        this.fuel = fuel

        this.icon_col = col
        this.icon_row = row
        this.icon = new Icon(this)
    }
    // Orders buildings from slowest to fastest. Module slots break ties.
    less(other) {
        if (!this.speed.equal(other.speed)) {
            return this.speed.less(other.speed)
        }
        return this.moduleSlots < other.moduleSlots
    }
    // Returns the number of buildings needed to run recipe at rate crafts per second.
    getCount(spec, recipe, rate) {
        return rate.div(this.getRecipeRate(spec, recipe))
    }
    // Returns crafts per second of one building, including module and beacon speed effects.
    getRecipeRate(spec, recipe) {
        let modules = spec.getModuleSpec(recipe)
        let speedEffect
        if (modules) {
            speedEffect = modules.speedEffect()
        } else {
            speedEffect = one
        }
        return recipe.time.reciprocate().mul(this.speed).mul(speedEffect)
    }
    // Returns whether modules and beacons can affect this building.
    canBeacon() {
        return this.moduleSlots > 0
    }
    // Returns the built-in productivity bonus, such as 0.5 for the foundry.
    prodEffect(spec) {
        return this.prodBonus
    }
    // Returns the idle drain of one electric building, which is 1/30 of its working power.
    drain() {
        return this.power.div(thirty)
    }
    // Returns a tooltip element with power, crafting speed and module slots.
    renderTooltip() {
        let self = this
        let t = d3.create("div")
            .classed("frame", true)
        let header = t.append("h3")
        header.append(() => self.icon.make(32, true))
        header.append(() => new Text(self.name))
        let line = t.append("div")
        line.append("b")
            .text("Energy consumption: ")
        let {power, suffix} = powerRepr(this.power)
        line.append("span")
            .text(`${power.toDecimal(0)} ${suffix}`)
        line = t.append("div")
        line.append("b")
            .text("Crafting speed: ")
        line.append("span")
            .text(this.speed.toDecimal())
        line = t.append("div")
        line.append("b")
            .text("Module slots: ")
        line.append("span")
            .text(String(this.moduleSlots))
        return t.node()
    }
}

// A mining drill. Its rate depends on mining speed and the resource's mining time.
class Miner extends Building {
    constructor(key, name, col, row, categories, miningSpeed, moduleSlots, power, fuel) {
        super(key, name, col, row, categories, zero, zero, moduleSlots, power, fuel)
        this.miningSpeed = miningSpeed
    }
    // Orders drills by mining speed.
    less(other) {
        return this.miningSpeed.less(other.miningSpeed)
    }
    // Mining drills have no idle drain.
    drain() {
        return zero
    }
    // Returns resource units mined per second by one drill.
    getRecipeRate(spec, recipe) {
        let modules = spec.getModuleSpec(recipe)
        let speedEffect
        if (modules) {
            speedEffect = modules.speedEffect()
        } else {
            speedEffect = one
        }
        return this.miningSpeed.div(recipe.miningTime).mul(speedEffect)
    }
    // Returns the mining productivity research bonus.
    prodEffect(spec) {
        return spec.miningProd
    }
    // Returns a tooltip element with power, mining speed and module slots.
    renderTooltip() {
        let self = this
        let t = d3.create("div")
            .classed("frame", true)
        let header = t.append("h3")
        header.append(() => self.icon.make(32, true))
        header.append(() => new Text(self.name))
        let line = t.append("div")
        line.append("b")
            .text("Energy consumption: ")
        let {power, suffix} = powerRepr(this.power)
        line.append("span")
            .text(`${power.toDecimal(0)} ${suffix}`)
        line = t.append("div")
        line.append("b")
            .text("Mining speed: ")
        line.append("span")
            .text(this.miningSpeed.toDecimal())
        line = t.append("div")
        line.append("b")
            .text("Module slots: ")
        line.append("span")
            .text(String(this.moduleSlots))
        return t.node()
    }
}

// An offshore pump. It uses no power and takes no modules.
class OffshorePump extends Building {
    constructor(key, name, col, row, pumpingSpeed) {
        super(key, name, col, row, ["offshore-pumping"], zero, zero, 0, zero, null)
        this.pumpingSpeed = pumpingSpeed
    }
    // Orders pumps by pumping speed.
    less(other) {
        return this.pumpingSpeed.less(other.pumpingSpeed)
    }
    // Returns fluid units pumped per second.
    getRecipeRate(spec, recipe) {
        return this.pumpingSpeed
    }
    // Returns a tooltip element with the pumping speed.
    renderTooltip() {
        let self = this
        let t = d3.create("div")
            .classed("frame", true)
        let header = t.append("h3")
        header.append(() => self.icon.make(32, true))
        header.append(() => new Text(self.name))
        let line = t.append("div")
        line.append("b")
            .text("Pumping speed: ")
        line.append("span")
            .text(`${spec.format.rate(this.pumpingSpeed)}/${spec.format.rateName}`)
        return t.node()
    }
}

let rocketLaunchDuration = Rational.from_floats(2434, 60)

// Returns rocket parts per second and launches per second of one silo. Both include the time
// the silo pauses for each launch.
function launchRate(spec) {
    let partRecipe = spec.recipes.get("rocket-part")
    let partFactory = spec.getBuilding(partRecipe)
    let partItem = spec.items.get("rocket-part")
    let gives = partRecipe.gives(partItem)
    // The base rate at which the silo can make rocket parts.
    let rate = Building.prototype.getRecipeRate.call(partFactory, spec, partRecipe)
    // Number of times to complete the rocket part recipe per launch.
    let perLaunch = partFactory.partsRequired.div(gives)
    // Total length of time required to launch a rocket.
    let time = perLaunch.div(rate).add(rocketLaunchDuration)
    let launchRate = time.reciprocate()
    let partRate = perLaunch.div(time)
    return {part: partRate, launch: launchRate}
}

// Pseudo-building for the rocket launch recipe.
class RocketLaunch extends Building {
    // Returns launches per second.
    getRecipeRate(spec, recipe) {
        return launchRate(spec).launch
    }
}

// The rocket silo building rocket parts. Its rate includes the pause for each launch.
class RocketSilo extends Building {
    // Returns rocket parts per second.
    getRecipeRate(spec, recipe) {
        return launchRate(spec).part
    }
}

function renderTooltipBase() {
    let self = this
    let t = d3.create("div")
        .classed("frame", true)
    let header = t.append("h3")
    header.append(() => self.icon.make(32, true))
    header.append(() => new Text(self.name))
    return t.node()
}

// Creates all buildings from the dataset, plus pseudo-buildings for the nuclear reactor,
// the boiler and the rocket launch.
export function getBuildings(data, items) {
    let buildings = []
    let reactorDef = items.get("nuclear-reactor")
    let reactor = new Building(
        "nuclear-reactor",
        reactorDef.name,
        reactorDef.icon_col,
        reactorDef.icon_row,
        ["nuclear"],
        one,
        zero,
        0,
        zero,
        null
    )
    reactor.renderTooltip = renderTooltipBase
    buildings.push(reactor)
    let boilerItem = items.get("boiler")
    let boilerDef
    for (let d of data.boilers) {
        if (d.key === "boiler") {
            boilerDef = d
            break
        }
    }
    let boiler_energy = Rational.from_float(boilerDef.energy_consumption)
    let boiler = new Building(
        "boiler",
        boilerItem.name,
        boilerItem.icon_col,
        boilerItem.icon_row,
        ["boiler"],
        one,
        zero,
        0,
        boiler_energy,
        "chemical",
        //boilerDef.target_temperature,
    )
    boiler.renderTooltip = renderTooltipBase
    buildings.push(boiler)
    let siloDef = items.get("rocket-silo")
    let launch = new RocketLaunch(
        "rocket-silo",
        siloDef.name,
        siloDef.icon_col,
        siloDef.icon_row,
        ["rocket-launch"],
        one,
        zero,
        0,
        zero,
        null
    )
    launch.renderTooltip = renderTooltipBase
    buildings.push(launch)
    for (let d of data.crafting_machines) {
        let fuel = null
        if (d.energy_source && d.energy_source.type === "burner") {
            fuel = d.energy_source.fuel_category
        }
        let prod = zero
        if (d.prod_bonus) {
            prod = Rational.from_float_approximate(d.prod_bonus)
        }
        buildings.push(new Building(
            d.key,
            d.localized_name.en,
            d.icon_col,
            d.icon_row,
            d.crafting_categories,
            Rational.from_float_approximate(d.crafting_speed),
            prod,
            d.module_slots,
            Rational.from_float_approximate(d.energy_usage),
            fuel
        ))
    }
    for (let d of data.rocket_silo) {
        let silo = new RocketSilo(
            d.key,
            d.localized_name.en,
            d.icon_col,
            d.icon_row,
            d.crafting_categories,
            Rational.from_float_approximate(d.crafting_speed),
            zero,
            d.module_slots,
            Rational.from_float_approximate(d.energy_usage),
            null
        )
        silo.partsRequired = Rational.from_float(d.rocket_parts_required)
        buildings.push(silo)
    }
    for (let d of data.offshore_pumps) {
        // Pumping speed is given in units/tick.
        let speed = Rational.from_float_approximate(d.pumping_speed).mul(Rational.from_float(60))
        buildings.push(new OffshorePump(
            d.key,
            d.localized_name.en,
            d.icon_col,
            d.icon_row,
            speed,
        ))
    }
    for (let d of data.mining_drills) {
        if (d.key == "pumpjack") {
            continue
        }
        let fuel = null
        if (d.energy_source && d.energy_source.type === "burner") {
            fuel = d.energy_source.fuel_category
        }
        buildings.push(new Miner(
            d.key,
            d.localized_name.en,
            d.icon_col,
            d.icon_row,
            d.resource_categories,
            Rational.from_float_approximate(d.mining_speed),
            d.module_slots,
            Rational.from_float_approximate(d.energy_usage),
            fuel
        ))
    }
    return buildings
}

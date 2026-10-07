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

// URL scenarios for the factory snapshot. Each one is loaded as a calculator URL fragment.
// Target rates are per minute unless the scenario sets another rate.

export const SCENARIOS = [
    ["default", ""],
    ["nauvis-processing-unit", "#items=processing-unit:r:60&planet=nauvis"],
    ["nauvis-modules-beacons", "#items=processing-unit:r:60&planet=nauvis&dm=p3&db=s3:s3&dbc=8"],
    ["nauvis-recipe-modules", "#items=iron-plate:r:600&planet=nauvis&modules=iron-plate:p3:p3;s3:s3:4"],
    ["nauvis-buildings-fuel", "#items=electronic-circuit:r:600&planet=nauvis&buildings=assembling-machine-1+assembling-machine-2+assembling-machine-3:assembling-machine-3,assembling-machine-1+assembling-machine-2+assembling-machine-3+electromagnetic-plant:assembling-machine-3,stone-furnace+electric-furnace+steel-furnace:steel-furnace,electric-mining-drill+burner-mining-drill+big-mining-drill:big-mining-drill&fuel=solid-fuel"],
    ["nauvis-kovarex-productivity", "#items=uranium-235:r:60&planet=nauvis&modules=kovarex-enrichment-process:p3:p3"],
    ["vulcanus-productivity-cap", "#items=steel-plate:r:600&planet=vulcanus&rprod=steel-plate-productivity:25&modules=casting-steel:p3:p3:p3:p3"],
    ["nauvis-research", "#items=processing-unit:r:60&planet=nauvis&rprod=processing-unit-productivity:3"],
    ["nauvis-rocket-cargo", "#items=processing-unit-in-orbit:r:600&planet=nauvis"],
    ["nauvis-steam-power", "#items=processing-unit:r:60&planet=nauvis&enable=steam-engine-power"],
    ["nauvis-solar-power", "#items=processing-unit:r:60&planet=nauvis&enable=solar-panel-nauvis"],
    ["nauvis-nuclear-power", "#items=processing-unit:r:60&planet=nauvis&enable=steam-turbine-power,nuclear-reactor-cycle"],
    ["nauvis-nuclear-reactor-block", "#items=processing-unit:r:60&planet=nauvis&enable=steam-turbine-power,nuclear-reactor-cycle&reactors=4"],
    ["nauvis-quality", "#items=processing-unit:r:60&planet=nauvis&dm=s3&db=s3:s3&dbc=4&qm=rare&qd=legendary&qb=epic"],
    ["nauvis-recipe-quality", "#items=processing-unit:r:60&planet=nauvis&dm=s3&db=s3:s3&dbc=4&qm=rare&rq=processing-unit:legendary:epic:,electronic-circuit::legendary:uncommon"],
    ["nauvis-ignore", "#items=advanced-circuit:r:60&planet=nauvis&ignore=electronic-circuit"],
    ["nauvis-disable", "#items=plastic-bar:r:600&planet=nauvis&disable=advanced-oil-processing"],
    ["nauvis-priority-weight", "#items=plastic-bar:r:600&planet=nauvis&priority=water=10;crude-oil=100000"],
    ["nauvis-priority-level", "#items=plastic-bar:r:600&planet=nauvis&priority=water=10;coal=100;crude-oil=10"],
    ["nauvis-mining-productivity", "#items=iron-gear-wheel:r:600&planet=nauvis&mprod=50"],
    ["nauvis-building-target", "#items=rocket-part:f:2&planet=nauvis"],
    ["nauvis-sciences", "#items=automation-science-pack:r:60,logistic-science-pack:r:60,chemical-science-pack:r:60&planet=nauvis"],
    ["nauvis-per-second", "#items=copper-cable:r:10&planet=nauvis&rate=s"],
    ["vulcanus", "#items=tungsten-plate:r:60,metallurgic-science-pack:r:60&planet=vulcanus"],
    ["gleba", "#items=agricultural-science-pack:r:60&planet=gleba"],
    ["fulgora", "#items=electromagnetic-science-pack:r:60&planet=fulgora"],
    ["aquilo", "#items=cryogenic-science-pack:r:60&planet=aquilo"],
    ["aquilo-fusion-power", "#items=cryogenic-science-pack:r:60&planet=aquilo&enable=fusion-generator-power"],
    ["aquilo-heating", "#items=cryogenic-science-pack:r:60&planet=aquilo&enable=heating-tower-heat"],
    ["nauvis-vulcanus", "#items=low-density-structure:r:60&planet=nauvis,vulcanus"],
    ["space-platform", "#items=space-science-pack:r:60&planet=space-platform"],
    ["space-platform-thrusters", "#items=thruster-fuel:r:6000,thruster-oxidizer:r:6000&planet=space-platform"],
    ["space-platform-promethium", "#items=promethium-science-pack:r:60&planet=space-platform"],
]

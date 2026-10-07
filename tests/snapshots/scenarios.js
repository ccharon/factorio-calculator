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
    ["nauvis-ignore", "#items=advanced-circuit:r:60&planet=nauvis&ignore=electronic-circuit"],
    ["nauvis-disable", "#items=plastic-bar:r:600&planet=nauvis&disable=advanced-oil-processing"],
    ["nauvis-mining-productivity", "#items=iron-gear-wheel:r:600&planet=nauvis&mprod=50"],
    ["nauvis-building-target", "#items=rocket-part:f:2&planet=nauvis"],
    ["nauvis-sciences", "#items=automation-science-pack:r:60,logistic-science-pack:r:60,chemical-science-pack:r:60&planet=nauvis"],
    ["nauvis-per-second", "#items=copper-cable:r:10&planet=nauvis&rate=s"],
    ["vulcanus", "#items=tungsten-plate:r:60,metallurgic-science-pack:r:60&planet=vulcanus"],
    ["gleba", "#items=agricultural-science-pack:r:60&planet=gleba"],
    ["fulgora", "#items=electromagnetic-science-pack:r:60&planet=fulgora"],
    ["aquilo", "#items=cryogenic-science-pack:r:60&planet=aquilo"],
    ["nauvis-vulcanus", "#items=low-density-structure:r:60&planet=nauvis,vulcanus"],
    ["space-platform", "#items=space-science-pack:r:60&planet=space-platform"],
]

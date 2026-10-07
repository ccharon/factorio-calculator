// Quality levels. Quality raises the crafting speed of machines, the positive effects of modules
// and the distribution effectivity of beacons.
import type { Dataset } from "./dataset.ts"
import type { IconSource } from "./icon-source.ts"

/** A quality level such as uncommon. */
export class Quality implements IconSource {
    readonly key: string
    readonly name: string
    readonly level: number
    readonly icon_col: number
    readonly icon_row: number

    constructor(key: string, name: string, level: number, col: number, row: number) {
        this.key = key
        this.name = name
        this.level = level
        this.icon_col = col
        this.icon_row = row
    }
}

/** The quality of machines, of modules and of beacons in the factory. */
export interface QualityContext {
    readonly machineQuality: Quality
    readonly moduleQuality: Quality
    readonly beaconQuality: Quality
}

/** Creates the quality levels from lowest to highest. */
export function getQualities(data: Dataset): Quality[] {
    return data.qualities.map(d => new Quality(d.key, d.localized_name.en, d.level, d.icon_col, d.icon_row))
}

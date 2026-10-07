// Technologies that raise the productivity of single recipes, such as steel plate productivity.
import { Rational, zero } from "../core/rational.ts"
import { Icon, type IconSource } from "../ui/icon.ts"
import type { Dataset } from "./dataset.ts"
import type { Recipe } from "./recipe.ts"

/** A productivity technology with the bonus it adds per level to each recipe it affects. */
export class ProductivityResearch implements IconSource {
    readonly key: string
    readonly name: string
    readonly order: string
    /** Highest level, or null for infinite research. */
    readonly maxLevel: number | null
    /** Productivity bonus per level by recipe, such as 0.1 for +10%. */
    readonly effects: ReadonlyMap<Recipe, Rational>
    readonly icon_col: number
    readonly icon_row: number
    readonly icon: Icon

    constructor(key: string, name: string, order: string, maxLevel: number | null, effects: ReadonlyMap<Recipe, Rational>, col: number, row: number) {
        this.key = key
        this.name = name
        this.order = order
        this.maxLevel = maxLevel
        this.effects = effects
        this.icon_col = col
        this.icon_row = row
        this.icon = new Icon(this)
    }

    /** Returns the productivity bonus of recipe at level, or zero if the technology does not affect it. */
    bonus(recipe: Recipe, level: number): Rational {
        return (this.effects.get(recipe) ?? zero).mul(Rational.from_float(level))
    }
}

/** Creates the productivity technologies of the dataset. Effects on unknown recipes are skipped. */
export function getProductivityResearch(data: Dataset, recipes: ReadonlyMap<string, Recipe>): ProductivityResearch[] {
    return data.recipe_productivity.map(d => {
        const effects = new Map<Recipe, Rational>()
        for (const { recipe: key, change } of d.effects) {
            const recipe = recipes.get(key)
            if (recipe !== undefined) {
                effects.set(recipe, Rational.from_float_approximate(change))
            }
        }
        return new ProductivityResearch(d.key, d.localized_name.en, d.order, d.max_level ?? null, effects, d.icon_col, d.icon_row)
    })
}

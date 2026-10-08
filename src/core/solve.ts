// SPDX-FileCopyrightText: 2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Computes recipe rates for the requested outputs. Simple chains are solved directly; cycles and
// recipes with several products go into a linear program solved with the simplex method.

import type { Item } from "../data/item.ts"
import { Ingredient, type RecipeLike, type RecipeNode } from "../data/recipe.ts"
import { type CycleContext, getCycleRecipes } from "./cycle.ts"
import { type Rational, minusOne, zero, one, two } from "./rational.ts"
import { Matrix, type SimplexRunner, runSimplexHere } from "./simplex.ts"
import { Totals, type TotalsContext } from "./totals.ts"

/** A requested output: an item rate, optionally forced through one recipe. */
export interface Output {
    item: Item
    /** Items per second. */
    rate: Rational
    /** Recipe that must produce the item, when the target is given as a building count. */
    recipe: RecipeLike | null
}

/** A build target, as far as the solver needs it. */
export interface SolverTarget {
    readonly item: Item
    readonly recipe: RecipeLike | null
    readonly changedBuilding: boolean
}

/** A recipe and its weight within one priority level. */
export interface PriorityEntry {
    readonly recipe: RecipeLike
    readonly weight: Rational
}

/** What the solver needs from the factory state. FactorySpecification implements it. */
export interface SolverContext extends CycleContext, TotalsContext {
    readonly ignore: ReadonlySet<Item>
    readonly buildTargets: readonly SolverTarget[]
    /** Resource priority levels, most preferred first. */
    readonly priority: Iterable<Iterable<PriorityEntry>>
    /** Returns the recipes that may contribute to producing the given items. */
    getRecipeGraph(items: ReadonlyMap<Item, Rational>): Set<RecipeLike>
    /** Returns the productivity multiplier of recipe, such as 1.5 for +50%. */
    getProdEffect(recipe: RecipeLike): Rational
}

/** Terminating node of a solution graph: consumes the requested outputs. */
class OutputRecipe implements RecipeNode {
    readonly name: string = "output"
    readonly ingredients: Ingredient[]
    readonly products: Ingredient[] = []

    constructor(outputs: ReadonlyMap<Item, Rational>) {
        this.ingredients = Array.from(outputs, ([item, rate]) => new Ingredient(item, rate))
    }

    /** Returns the consumed outputs. */
    getIngredients(): Ingredient[] {
        return this.ingredients
    }

    /** Throws. Output nodes produce nothing. */
    gives(item: Item): Rational {
        throw new Error(`${this.name} does not give ${item.key}`)
    }

    /** Returns false. This node is not a game recipe. */
    isReal(): boolean {
        return false
    }
}

/** Terminating node that consumes the surplus items of a solution. */
class SurplusRecipe extends OutputRecipe {
    override readonly name: string = "surplus"
}

/** A building-count target the direct solution could not satisfy. */
export interface UnfinishedTarget {
    readonly item: Item
    readonly rate: Rational
    readonly recipe: RecipeLike
}

/** Partial solution from following simple production chains. */
export class PartialSolution {
    readonly recipeRates: Map<RecipeNode, Rational> = new Map()
    /** Item rates still to be produced by the linear program. */
    readonly remaining: Map<Item, Rational> = new Map()
    targets: UnfinishedTarget[] = []

    /** Adds rate crafts per second of recipe. */
    add(recipe: RecipeNode, rate: Rational): void {
        this.recipeRates.set(recipe, (this.recipeRates.get(recipe) ?? zero).add(rate))
    }

    /** Leaves rate items per second of item for the linear program. */
    remainder(item: Item, rate: Rational): void {
        this.remaining.set(item, (this.remaining.get(item) ?? zero).add(rate))
    }

    /** Merges other into this solution. */
    combine(other: PartialSolution): void {
        for (const [recipe, rate] of other.recipeRates) {
            this.add(recipe, rate)
        }
        for (const [item, rate] of other.remaining) {
            this.remainder(item, rate)
        }
        this.targets = this.targets.concat(other.targets)
    }
}

/** Rows and columns of the last simplex tableau, for the debug tab. */
export interface TableauMetadata {
    readonly items: Item[]
    readonly recipes: RecipeLike[]
    readonly targets: UnfinishedTarget[]
}

/** Intermediate results of the last solve, shown in the debug tab. */
export interface SolverDebug {
    readonly partial: PartialSolution
    /** The tableau before solving, or null if no linear program was needed. */
    readonly tableau: Matrix | null
    readonly metadata: TableauMetadata | null
    /** The tableau after solving. */
    readonly solution: Matrix | null
}

/** The solution of solve() plus its debug data. */
export interface SolveResult {
    readonly totals: Totals
    readonly debug: SolverDebug
}

// Follows the chain from item down to resources as long as every item has exactly one recipe
// with one product outside of cycles. Everything else is left for the linear program.
function traverse(context: SolverContext, cyclic: ReadonlySet<RecipeLike>, item: Item, rate: Rational, forceRecipe: RecipeLike | null): PartialSolution {
    const result = new PartialSolution()
    let recipe = forceRecipe
    if (recipe === null) {
        const itemRecipes = context.getRecipes(item)
        const only = itemRecipes[0]
        if (itemRecipes.length !== 1 || only === undefined || context.getProducts(only).length > 1 || cyclic.has(only)) {
            result.remainder(item, rate)
            return result
        }
        recipe = only
    } else if (context.getProducts(recipe).length > 1 || cyclic.has(recipe)) {
        result.remainder(item, rate)
        result.targets.push({ item, rate, recipe })
        return result
    }

    const recipeRate = rate.div(recipe.gives(item, context))
    result.add(recipe, recipeRate)

    if (context.ignore.has(item)) {
        return result
    }

    for (const ing of recipe.getIngredients(context)) {
        result.combine(traverse(context, cyclic, ing.item, recipeRate.mul(ing.amount), null))
    }
    return result
}

/* Tableau layout:

Columns:
[surplus items] [pseudo] [tax] [recipes] [result] [cost]

Rows:
[recipes]
[tax]
[result]
*/

/**
 * Solves the factory for the requested outputs.
 *
 * @param runSimplex - Solves the linear program, by default in this thread.
 */
export async function solve(context: SolverContext, fullOutputs: readonly Output[], runSimplex: SimplexRunner = runSimplexHere): Promise<SolveResult> {
    const outputs = new Map<Item, Rational>()
    for (const { item, rate } of fullOutputs) {
        outputs.set(item, rate.add(outputs.get(item) ?? zero))
    }

    let recipes = context.getRecipeGraph(outputs)
    const cyclic = getCycleRecipes(context, recipes)

    const partial = new PartialSolution()
    for (const { item, rate, recipe } of fullOutputs) {
        partial.combine(traverse(context, cyclic, item, rate, recipe))
    }

    const solution = partial.recipeRates

    if (partial.remaining.size === 0) {
        solution.set(new OutputRecipe(outputs), one)
        return {
            totals: new Totals(context, outputs, solution, new Map(), new Map()),
            debug: { partial, tableau: null, metadata: null, solution: null },
        }
    }

    recipes = context.getRecipeGraph(partial.remaining)

    // An item gets its DisabledRecipe as a producer of last resort at the highest priority if
    // 1) it links recipes inside a cycle, and
    // 2) no recipe outside the cycle produces it, unless the item is a building-count target.
    // Such items can be part of a net-negative loop, and the extra producer keeps the program feasible.
    const targetItemMap = new Map<Item, RecipeLike>()
    for (const target of context.buildTargets) {
        if (target.changedBuilding && target.recipe) {
            targetItemMap.set(target.item, target.recipe)
        }
    }

    const maxPriorityRecipes = new Map<Item, RecipeLike>()
    for (const recipe of recipes) {
        if (!cyclic.has(recipe)) {
            continue
        }
        for (const { item } of recipe.getIngredients(context)) {
            if (recipes.has(item.disableRecipe)) {
                continue
            }
            let candidate = false
            let outside = false
            for (const subrecipe of context.getRecipes(item)) {
                if (cyclic.has(subrecipe)) {
                    candidate = true
                } else if (recipes.has(subrecipe)) {
                    outside = true
                }
            }
            if (candidate && (targetItemMap.has(item) || !outside)) {
                maxPriorityRecipes.set(item, item.disableRecipe)
            }
        }
    }

    for (const recipe of maxPriorityRecipes.values()) {
        recipes.add(recipe)
    }

    const items: Item[] = []
    const itemColumns = new Map<Item, number>()
    const recipeArray: RecipeLike[] = []
    const recipeRows = new Map<RecipeLike, number>()
    for (const recipe of recipes) {
        recipeRows.set(recipe, recipeArray.length)
        recipeArray.push(recipe)
        for (const ing of context.getProducts(recipe)) {
            if (!itemColumns.has(ing.item)) {
                itemColumns.set(ing.item, items.length)
                items.push(ing.item)
            }
        }
    }

    const column = (item: Item): number => {
        const j = itemColumns.get(item)
        if (j === undefined) {
            throw new Error(`no tableau column for ${item.key}`)
        }
        return j
    }
    const row = (recipe: RecipeLike): number => {
        const i = recipeRows.get(recipe)
        if (i === undefined) {
            throw new Error(`no tableau row for ${recipe.key}`)
        }
        return i
    }

    // Building-count targets for recipes in a cycle or with several products become pseudo-item
    // columns that copy the production of the real item.

    const taxCol = items.length + partial.targets.length
    // Column of recipe i in the block after the tax column. The solution holds its rate there.
    const recipeCol = (i: number): number => taxCol + 1 + i
    const resultCol = recipeCol(recipeArray.length)
    const costCol = resultCol + 1
    const taxRow = recipeArray.length
    const resultRow = taxRow + 1
    const A = new Matrix(resultRow + 1, costCol + 1)

    recipeArray.forEach((recipe, i) => {
        const prodEffect = context.getProdEffect(recipe)
        for (const ing of context.getProducts(recipe)) {
            A.addIndex(i, column(ing.item), ing.productAmount(prodEffect))
        }
        for (const ing of recipe.getIngredients(context)) {
            A.addIndex(i, column(ing.item), zero.sub(ing.amount))
        }

        A.setIndex(i, taxCol, minusOne)
        A.setIndex(i, recipeCol(i), one)
    })

    partial.targets.forEach(({ recipe, item, rate }, i) => {
        const r = row(recipe)
        const col = items.length + i
        A.setIndex(r, col, A.index(r, column(item)))
        A.setIndex(resultRow, col, zero.sub(rate))
    })

    A.setIndex(taxRow, taxCol, one)
    A.setIndex(resultRow, resultCol, one)

    for (const [item, rate] of partial.remaining) {
        A.setIndex(resultRow, column(item), zero.sub(rate))
    }

    // Cost function. Each priority level costs more than all lower levels together.
    let min: Rational | null = null
    let max = zero
    for (const value of A.mat) {
        if (value.isZero()) {
            continue
        }
        const x = value.abs()
        if (min === null || x.less(min)) {
            min = x
        }
        if (max.less(x)) {
            max = x
        }
    }

    let costRatio = min === null ? two : max.div(min).mul(two)
    // The cost ratio must be greater than 1.
    if (costRatio.less(two)) {
        costRatio = two
    }

    A.setIndex(taxRow, costCol, one)
    let P = costRatio
    for (const level of context.priority) {
        const entries = Array.from(level)
        let minWeight: Rational | null = null
        for (const { weight } of entries) {
            if (minWeight === null || weight.less(minWeight)) {
                minWeight = weight
            }
        }

        let N = zero
        for (const { recipe, weight } of entries) {
            const r = recipeRows.get(recipe)
            if (r !== undefined && minWeight !== null) {
                const normalizedWeight = weight.div(minWeight)
                N = N.add(normalizedWeight)
                A.setIndex(r, costCol, P.mul(normalizedWeight))
            }
        }

        if (!N.isZero()) {
            P = P.mul(costRatio).mul(N)
        }
    }

    for (const recipe of maxPriorityRecipes.values()) {
        A.setIndex(row(recipe), costCol, P)
    }
    // A DisabledRecipe outside the priority list, such as one of an item variant, is the last resort too.
    recipeArray.forEach((recipe, i) => {
        if (recipe.isDisable() && A.index(i, costCol).isZero()) {
            A.setIndex(i, costCol, P)
        }
    })

    const tableau = A.copy()
    const metadata: TableauMetadata = { items, recipes: recipeArray, targets: partial.targets }

    const solved = await runSimplex(A)

    recipeArray.forEach((recipe, i) => {
        const rate = solved.index(resultRow, recipeCol(i))
        if (zero.less(rate)) {
            solution.set(recipe, (solution.get(recipe) ?? zero).add(rate))
        }
    })

    solution.set(new OutputRecipe(outputs), one)

    const surplus = new Map<Item, Rational>()
    items.forEach((item, i) => {
        const rate = solved.index(resultRow, i)
        if (zero.less(rate)) {
            surplus.set(item, rate)
        }
    })
    if (surplus.size > 0) {
        solution.set(new SurplusRecipe(surplus), one)
    }

    return {
        totals: new Totals(context, outputs, solution, surplus, maxPriorityRecipes),
        debug: { partial, tableau, metadata, solution: solved },
    }
}

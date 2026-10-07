/*Copyright 2021 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Debug tab: shows the simplex tableau of the last solve before and after solving.

import * as d3 from "d3"
import type { Matrix } from "../core/matrix.ts"
import type { TableauMetadata } from "../core/solve.ts"
import { spec } from "../state/factory.ts"

function renderMatrix(container: d3.Selection<HTMLElement, unknown, HTMLElement, unknown>, A: Matrix, m: TableauMetadata): void {
    const table = container.append("table").attr("border", 1)
    const header = table.append("tr")
    header.append("th")
    for (const item of m.items) {
        const th = header.append("th")
        th.node()?.append("s")
        th.append(() => item.icon.make(32)).classed("item-icon", true)
    }
    for (const t of m.targets) {
        const th = header.append("th")
        th.append(() => t.item.icon.make(32))
        th.node()?.append("\u21d0")
        th.append(() => t.recipe.icon.make(32))
    }
    header.append("th").text("tax")
    for (const recipe of m.recipes) {
        header.append("th").append(() => recipe.icon.make(32)).classed("item-icon", true)
    }
    header.append("th").text("answer")
    header.append("th").text("C")
    for (let r = 0; r < A.rows; r++) {
        const row = table.append("tr")
        const label = row.append("td")
        const recipe = m.recipes[r]
        if (recipe !== undefined) {
            label.append(() => recipe.icon.make(32)).classed("item-icon", true)
        } else {
            label.text(r === A.rows - 2 ? "tax" : "answer")
        }
        for (let c = 0; c < A.cols; c++) {
            row.append("td").classed("right-align", true).append("tt").text(A.index(r, c).toString())
        }
    }
}

/** Renders the last tableau and its solution into the debug tab. */
export function renderDebug(): void {
    const tableau = d3.select<HTMLElement, unknown>("#debug_tableau")
    tableau.selectChildren().remove()
    const solution = d3.select<HTMLElement, unknown>("#debug_solution")
    solution.selectChildren().remove()

    if (spec.lastTableau === null || spec.lastSolution === null || spec.lastMetadata === null) {
        d3.select("#debug_message").text("No tableau required.")
    } else {
        d3.select("#debug_message").text("Displaying previous tableau.")
        renderMatrix(tableau, spec.lastTableau, spec.lastMetadata)
        renderMatrix(solution, spec.lastSolution, spec.lastMetadata)
    }
}

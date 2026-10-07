/*Copyright 2015-2019 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Simplex method on a tableau whose last row is the objective and last column the right-hand side.

import type { Matrix } from "./matrix.ts"
import { type Rational, zero } from "./rational.ts"

function pivot(A: Matrix, row: number, col: number): void {
    A.mulRow(row, A.index(row, col).reciprocate())
    for (let r = 0; r < A.rows; r++) {
        if (r === row) {
            continue
        }
        const ratio = A.index(r, col)
        if (ratio.isZero()) {
            continue
        }
        for (let c = 0; c < A.cols; c++) {
            A.setIndex(r, c, A.index(r, c).sub(A.index(row, c).mul(ratio)))
        }
    }
}

// Pivots on the row with the smallest ratio test in col. Returns the row, or null if no row
// qualifies, which means the problem is unbounded.
function pivotCol(A: Matrix, col: number): number | null {
    let bestRatio: Rational | null = null
    let bestRow: number | null = null
    for (let row = 0; row < A.rows - 1; row++) {
        const x = A.index(row, col)
        if (!zero.less(x)) {
            continue
        }
        const ratio = A.index(row, A.cols - 1).div(x)
        if (bestRatio === null || ratio.less(bestRatio)) {
            bestRatio = ratio
            bestRow = row
        }
    }
    if (bestRow !== null) {
        pivot(A, bestRow, col)
    }
    return bestRow
}

/**
 * Runs the simplex method in place until the objective row has no negative entries.
 * Throws if the problem is unbounded.
 */
export function simplex(A: Matrix): void {
    for (;;) {
        let min: Rational | null = null
        let minCol = 0
        for (let col = 0; col < A.cols - 1; col++) {
            const x = A.index(A.rows - 1, col)
            if (min === null || x.less(min)) {
                min = x
                minCol = col
            }
        }
        if (min === null || !min.less(zero)) {
            return
        }
        if (pivotCol(A, minCol) === null) {
            throw new Error("failed to pivot")
        }
    }
}

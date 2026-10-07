/*Copyright 2015-2021 Kirk McDonald
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
// Simplex method on a tableau whose last row is the objective and last column the right-hand side.

import { type Rational, zero } from "./rational.ts"

/** A rows x cols matrix of rationals, stored row by row. */
export class Matrix {
    readonly rows: number
    readonly cols: number
    readonly mat: Rational[]

    /**
     * @param mat - Initial values row by row. Defaults to all zeros.
     */
    constructor(rows: number, cols: number, mat?: Rational[]) {
        this.rows = rows
        this.cols = cols
        this.mat = mat ?? Array.from({ length: rows * cols }, () => zero)
    }

    /** Returns an independent copy. */
    copy(): Matrix {
        return new Matrix(this.rows, this.cols, this.mat.slice())
    }

    /** Returns the value at row, col. Throws if the position is outside the matrix. */
    index(row: number, col: number): Rational {
        const value = this.mat[row * this.cols + col]
        if (value === undefined || col >= this.cols) {
            throw new RangeError(`matrix index ${row},${col} outside ${this.rows}x${this.cols}`)
        }
        return value
    }

    /** Sets the value at row, col. */
    setIndex(row: number, col: number, value: Rational): void {
        this.mat[row * this.cols + col] = value
    }

    /** Adds value to the value at row, col. */
    addIndex(row: number, col: number, value: Rational): void {
        this.setIndex(row, col, this.index(row, col).add(value))
    }

    /** Multiplies every value of a row by value. */
    mulRow(row: number, value: Rational): void {
        for (let i = 0; i < this.cols; i++) {
            this.setIndex(row, i, this.index(row, i).mul(value))
        }
    }
}

function pivot(A: Matrix, row: number, col: number): void {
    A.mulRow(row, A.index(row, col).reciprocate())
    // The tableau is sparse. Columns where the pivot row is zero do not change.
    const columns: number[] = []
    for (let c = 0; c < A.cols; c++) {
        if (!A.index(row, c).isZero()) {
            columns.push(c)
        }
    }
    for (let r = 0; r < A.rows; r++) {
        if (r === row) {
            continue
        }
        const ratio = A.index(r, col)
        if (ratio.isZero()) {
            continue
        }
        for (const c of columns) {
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

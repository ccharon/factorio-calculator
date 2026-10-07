/*Copyright 2015-2021 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Dense matrix of rationals, used as the simplex tableau.

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

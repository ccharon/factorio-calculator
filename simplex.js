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

import { zero } from "./rational.js"

function pivot(A, row, col) {
    let x = A.index(row, col)
    A.mulRow(row, x.reciprocate())
    for (let r = 0; r < A.rows; r++) {
        if (r === row) {
            continue
        }
        let ratio = A.index(r, col)
        if (ratio.isZero()) {
            continue
        }

        for (let c = 0; c < A.cols; c++) {
            x = A.index(r, c).sub(A.index(row, c).mul(ratio))
            A.setIndex(r, c, x)
        }
    }
}

function pivotCol(A, col) {
    let best_ratio = null
    let best_row = null
    for (let row = 0; row < A.rows - 1; row++) {
        let x = A.index(row, col)
        if (!zero.less(x)) {
            continue
        }
        let ratio = A.index(row, A.cols - 1).div(x)
        if (best_ratio === null || ratio.less(best_ratio)) {
            best_ratio = ratio
            best_row = row
        }
    }
    if (best_ratio !== null) {
        pivot(A, best_row, col)
    }
    return best_row
}

export function simplex(A) {
    while (true) {
        let min = null
        let minCol = null
        for (let col = 0; col < A.cols - 1; col++) {
            let x = A.index(A.rows - 1, col)
            if (min === null || x.less(min)) {
                min = x
                minCol = col
            }
        }
        if (!min.less(zero)) {
            return
        }
        let bestRow = pivotCol(A, minCol)
        if (bestRow === null) {
            throw new Error("failed to pivot")
        }
    }
}

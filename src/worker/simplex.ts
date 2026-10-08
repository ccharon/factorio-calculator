// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Web Worker that runs the simplex method, so that large linear programs do not block the page.
// src/state/solver-thread.ts sends the tableau and receives the solved one.

import { Matrix, type TransferMatrix, simplex } from "../core/simplex.ts"

/** The reply to one tableau: the solved tableau, or the error that stopped the simplex method. */
export type SimplexReply = { readonly solved: TransferMatrix } | { readonly error: string }

self.addEventListener("message", (event: MessageEvent<TransferMatrix>) => {
    let reply: SimplexReply
    try {
        const A = Matrix.fromTransfer(event.data)
        simplex(A)
        reply = { solved: A.toTransfer() }
    } catch (error) {
        reply = { error: error instanceof Error ? error.message : String(error) }
    }
    self.postMessage(reply)
})

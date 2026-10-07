/*Copyright 2026 Christian Charon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/

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

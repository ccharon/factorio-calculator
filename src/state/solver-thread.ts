// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Runs the simplex method in a Web Worker, so that the page stays responsive while large linear
// programs solve. A new run cancels the one in progress.

import { Matrix, runSimplexHere } from "../core/simplex.ts"
import type { SimplexReply } from "../worker/simplex.ts"

/** The error of a run that a newer run cancelled. */
export class SolveCancelled extends Error {
    constructor() {
        super("solve cancelled by a newer one")
        this.name = "SolveCancelled"
    }
}

let worker: Worker | null = null
// Rejects the run in progress, or null if the worker is idle.
let cancelRun: ((reason: Error) => void) | null = null

/** Solves A in the worker. Without Web Workers, such as in unit tests, it solves in this thread. */
export function runSimplexInWorker(A: Matrix): Promise<Matrix> {
    if (typeof Worker === "undefined") {
        return runSimplexHere(A)
    }
    if (cancelRun !== null) {
        // A worker cannot be interrupted, so a new one replaces it.
        worker?.terminate()
        worker = null
        cancelRun(new SolveCancelled())
        cancelRun = null
    }

    const thread = worker ?? new Worker(new URL("../worker/simplex.ts", import.meta.url), { type: "module" })
    worker = thread
    return new Promise((resolve, reject) => {
        cancelRun = reject
        thread.onmessage = (event: MessageEvent<SimplexReply>): void => {
            cancelRun = null
            const reply = event.data
            if ("error" in reply) {
                reject(new Error(reply.error))
            } else {
                resolve(Matrix.fromTransfer(reply.solved))
            }
        }
        thread.onerror = (event: ErrorEvent): void => {
            cancelRun = null
            worker = null
            reject(new Error(event.message))
        }
        thread.postMessage(A.toTransfer())
    })
}

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

// Builds the icon sprite sheet from Factorio's --dump-icon-sprites output and replaces
// the dataset's icon_ref placeholders with sheet positions.

import { createHash } from "node:crypto"
import { join } from "node:path"
import sharp from "sharp"

export const ICON_SIZE = 32

/**
 * Resolves an icon_ref to a PNG path.
 *
 * "<dir>/<name>" refers to the icon dump, "file:__mod__/path" to a file in the game's data directory.
 *
 * @param {string} ref - An icon_ref from convert.js.
 * @param {string} iconDir - The script-output directory of --dump-icon-sprites.
 * @param {string} gameDataDir - The game's data directory, such as ".../factorio/data".
 * @returns {string} Absolute file path.
 */
export function resolveIconRef(ref, iconDir, gameDataDir) {
    if (ref.startsWith("file:")) {
        const match = /^file:__([a-z0-9-]+)__\/(.+)$/.exec(ref)
        if (!match) {
            throw new Error(`unsupported icon path: ${ref}`)
        }
        return join(gameDataDir, match[1], match[2])
    }
    return join(iconDir, `${ref}.png`)
}

// Loads one icon as raw RGBA pixels at ICON_SIZE. Mipmapped files are a horizontal strip
// whose first square is the full-size image.
async function loadIcon(path) {
    const image = sharp(path)
    const { width, height } = await image.metadata()
    if (width > height) {
        image.extract({ left: 0, top: 0, width: height, height })
    }
    return image.resize(ICON_SIZE, ICON_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer()
}

// Yields every object in the dataset that carries an icon_ref.
function* iconHolders(node) {
    if (Array.isArray(node)) {
        for (const x of node) {
            yield* iconHolders(x)
        }
    } else if (node && typeof node === "object") {
        if (typeof node.icon_ref === "string") {
            yield node
        }
        for (const x of Object.values(node)) {
            yield* iconHolders(x)
        }
    }
}

/**
 * Renders all icons referenced by the dataset into one sheet and rewrites the dataset in place:
 * each icon_ref becomes icon_col/icon_row, and dataset.sprites gets hash, width and height.
 * Identical icons share one cell.
 *
 * @param {Object} dataset - Output of convert().
 * @param {string} iconDir - The script-output directory of --dump-icon-sprites.
 * @param {string} gameDataDir - The game's data directory.
 * @returns {Promise<{png: Buffer, hash: string}>} The sheet image and its MD5 hash.
 */
export async function buildSpriteSheet(dataset, iconDir, gameDataDir) {
    const holders = [...iconHolders(dataset)]
    const refs = [...new Set(holders.map(h => h.icon_ref))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    const cellByPixels = new Map()
    const cellByRef = new Map()
    const cells = []
    for (const ref of refs) {
        const pixels = await loadIcon(resolveIconRef(ref, iconDir, gameDataDir))
        const digest = createHash("sha256").update(pixels).digest("hex")
        let cell = cellByPixels.get(digest)
        if (cell === undefined) {
            cell = cells.length
            cells.push(pixels)
            cellByPixels.set(digest, cell)
        }
        cellByRef.set(ref, cell)
    }

    const columns = Math.ceil(Math.sqrt(cells.length))
    const rows = Math.ceil(cells.length / columns)
    const width = columns * ICON_SIZE
    const height = rows * ICON_SIZE
    const png = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(cells.map((pixels, i) => ({
        input: pixels,
        raw: { width: ICON_SIZE, height: ICON_SIZE, channels: 4 },
        left: (i % columns) * ICON_SIZE,
        top: Math.floor(i / columns) * ICON_SIZE,
    }))).png({ compressionLevel: 9 }).toBuffer()

    const hash = createHash("md5").update(png).digest("hex")

    for (const holder of holders) {
        const cell = cellByRef.get(holder.icon_ref)
        holder.icon_col = cell % columns
        holder.icon_row = Math.floor(cell / columns)
        delete holder.icon_ref
    }

    Object.assign(dataset.sprites, { hash, width, height })
    return { png, hash }
}

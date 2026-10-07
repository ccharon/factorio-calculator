/*Copyright 2021 Kirk McDonald
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
// Icons from the sprite sheet, rendered as <img> elements with a background offset.

import * as d3 from "d3"
import type { SpriteSheetData } from "../data/dataset.ts"
import type { IconSource } from "../data/icon-source.ts"
import { Tooltip } from "./tooltip.ts"

export const PX_WIDTH = 32
export const PX_HEIGHT = 32


/** The icon of one object in the sprite sheet. */
export class Icon {
    /** Alt text of the image. */
    readonly name: string
    readonly obj: IconSource
    private readonly tooltip: (() => Node) | null

    /**
     * @param obj - The object the icon represents.
     * @param tooltip - Returns the tooltip content. Without it, the image gets a title attribute.
     */
    constructor(obj: IconSource, tooltip: (() => Node) | null = null) {
        this.name = obj.iconName ?? obj.name
        this.obj = obj
        this.tooltip = tooltip
    }

    /**
     * Creates a new <img> element for this icon.
     *
     * @param size - Width and height in pixels.
     * @param suppressTooltip - If true, the image gets a title attribute instead of a tooltip.
     * @param target - Element the tooltip is placed next to. Defaults to the image.
     */
    make(size: number, suppressTooltip = false, target?: Element): HTMLImageElement {
        const sheet = spriteSheet()

        let x = -this.obj.icon_col * PX_WIDTH
        let y = -this.obj.icon_row * PX_HEIGHT
        const img = d3.select(makeEmptyIcon(size)).classed("icon", true).style("background", `url(images/sprite-sheet-${sheet.hash}.png)`)

        if (size !== PX_WIDTH) {
            const ratio = size / PX_WIDTH
            x *= ratio
            y *= ratio
            img.style("background-size", `${sheet.width * ratio}px ${sheet.height * ratio}px`)
        }
        img.style("background-position", `${x}px ${y}px`)

        if (!suppressTooltip && this.tooltip !== null) {
            new Tooltip(img.node() as HTMLImageElement, this.tooltip, target)
        } else {
            img.attr("title", this.obj.name)
        }

        img.attr("alt", this.name)
        return img.node() as HTMLImageElement
    }
}

/**
 * Creates an empty <img> element of the given size.
 *
 * @param size - Width and height in pixels. If 0 or omitted, the size comes from the style sheet.
 */
export function makeEmptyIcon(size?: number): HTMLImageElement {
    const img = document.createElement("img")
    img.classList.add("icon")
    // Chrome draws a border around an <img> without src, so it gets a transparent pixel.
    img.src = "images/pixel.gif"
    if (size) {
        img.width = size
        img.height = size
    }
    return img
}

/** An extra sprite from the sheet that belongs to no game object, such as the clock. */
class Sprite implements IconSource {
    readonly name: string
    readonly icon_col: number
    readonly icon_row: number

    constructor(name: string, col: number, row: number) {
        this.name = name
        this.icon_col = col
        this.icon_row = row
    }
}

let sheet: SpriteSheetData | null = null

/** Extra sprites by name, such as "clock" and "slot_icon_module". Filled by getSprites(). */
export const sprites: Map<string, Sprite> = new Map()

/** Returns the sprite sheet of the loaded dataset. Throws before getSprites() ran. */
export function spriteSheet(): SpriteSheetData {
    if (sheet === null) {
        throw new Error("sprite sheet not loaded")
    }
    return sheet
}

/** Returns the extra sprite with this name. Throws if it does not exist. */
export function getSprite(name: string): Sprite {
    const sprite = sprites.get(name)
    if (sprite === undefined) {
        throw new Error(`unknown sprite: ${name}`)
    }
    return sprite
}

/** Stores the sprite sheet of the loaded dataset and creates its extra sprites. */
export function getSprites(data: { sprites: SpriteSheetData }): void {
    sheet = data.sprites
    sprites.clear()
    for (const [name, d] of Object.entries(data.sprites.extra)) {
        sprites.set(name, new Sprite(d.name, d.icon_col, d.icon_row))
    }
}

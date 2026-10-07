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
    private readonly quality: IconSource | null

    /**
     * @param obj - The object the icon represents.
     * @param tooltip - Returns the tooltip content. Without it, the image gets a title attribute.
     * @param quality - The quality of an item or recipe variant, shown as a badge.
     */
    constructor(obj: IconSource, tooltip: (() => Node) | null = null, quality: IconSource | null = null) {
        this.name = obj.iconName ?? obj.name
        this.obj = obj
        this.tooltip = tooltip
        this.quality = quality
    }

    /**
     * Creates a new element for this icon: an <img>, or for a variant of higher quality a <span>
     * with the <img> and the quality badge.
     *
     * @param size - Width and height in pixels.
     * @param suppressTooltip - If true, the image gets a title attribute instead of a tooltip.
     * @param target - Element the tooltip is placed next to. Defaults to the icon.
     */
    make(size: number, suppressTooltip = false, target?: Element): HTMLElement {
        const img = spriteImage(this.obj, size)
        img.alt = this.name
        const quality = this.quality
        let icon: HTMLElement = img
        if (quality !== null) {
            icon = document.createElement("span")
            icon.classList.add("quality-icon")
            const badge = spriteImage(quality, Math.round(size * 0.45))
            badge.classList.add("quality-badge")
            badge.alt = quality.name
            icon.append(img, badge)
        }

        if (!suppressTooltip && this.tooltip !== null) {
            new Tooltip(icon, this.tooltip, target)
        } else {
            icon.title = quality === null ? this.obj.name : `${this.obj.name} (${quality.name})`
        }
        return icon
    }
}

// Creates an <img> that shows the sprite of obj at size pixels.
function spriteImage(obj: IconSource, size: number): HTMLImageElement {
    const sheet = spriteSheet()
    const ratio = size / PX_WIDTH
    const img = makeEmptyIcon(size)
    img.style.background = `url(images/sprite-sheet-${sheet.hash}.png)`
    if (size !== PX_WIDTH) {
        img.style.backgroundSize = `${sheet.width * ratio}px ${sheet.height * ratio}px`
    }
    img.style.backgroundPosition = `${-obj.icon_col * PX_WIDTH * ratio}px ${-obj.icon_row * PX_HEIGHT * ratio}px`
    return img
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

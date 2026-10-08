// SPDX-FileCopyrightText: 2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Icons from the sprite sheet, rendered as <img> elements with a background offset.

import type { SpriteSheetData } from "../data/dataset.ts"
import { type IconSource, SPRITE_SIZE } from "../data/icon-source.ts"
import { Tooltip } from "./tooltip.ts"

/** Display size of icons in tables, dropdowns, tooltips and the visualizer, in pixels. */
export const ICON_SIZE = SPRITE_SIZE

/** Display size of small icons, such as the quality choices of a build target. */
export const SMALL_ICON_SIZE = 24

/** Size of the quality badge relative to the icon it marks. */
export const QUALITY_BADGE_RATIO = 0.45

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
            const badge = spriteImage(quality, Math.round(size * QUALITY_BADGE_RATIO))
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
    const ratio = size / SPRITE_SIZE
    const img = makeEmptyIcon(size)
    img.style.background = `url(${spriteSheetURL()})`
    if (size !== SPRITE_SIZE) {
        img.style.backgroundSize = `${sheet.width * ratio}px ${sheet.height * ratio}px`
    }
    img.style.backgroundPosition = `${-obj.icon_col * SPRITE_SIZE * ratio}px ${-obj.icon_row * SPRITE_SIZE * ratio}px`
    return img
}

/**
 * Creates an empty <img> element of the given size.
 *
 * @param size - Width and height in pixels. If 0 or omitted, the size comes from the style sheet.
 */
function makeEmptyIcon(size?: number): HTMLImageElement {
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

/** Returns the URL of the sprite sheet of the loaded dataset. */
export function spriteSheetURL(): string {
    return `images/sprite-sheet-${spriteSheet().hash}.png`
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

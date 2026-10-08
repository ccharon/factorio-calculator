// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// The data every game object needs for its icon in the sprite sheet.

/** Anything that has an icon: an item, recipe, building, belt, planet and so on. */
export interface IconSource {
    readonly name: string
    readonly icon_col: number
    readonly icon_row: number

    /** Alt text of the icon, if it differs from name. */
    readonly iconName?: string
}

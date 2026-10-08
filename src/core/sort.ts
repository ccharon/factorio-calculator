// SPDX-FileCopyrightText: 2015-2024 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Stable sorting helper.

/** A value that can be compared with < and >. */
export type SortKey = string | number

/**
 * Returns the elements of collection in a new array, sorted by key. Elements with equal keys keep
 * their original order.
 *
 * @param collection - Any iterable.
 * @param key - Returns the sort key of an element.
 */
export function sorted<T>(collection: Iterable<T>, key: (value: T) => SortKey): T[] {
    // Array.prototype.sort is stable, so equal keys keep their order.
    const entries = Array.from(collection, value => ({ value, key: key(value) }))
    entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    return entries.map(e => e.value)
}

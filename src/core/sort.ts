/*Copyright 2015-2024 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
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

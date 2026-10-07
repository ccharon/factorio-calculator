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
    const values = Array.from(collection)
    const keys = values.map(key)
    const indexes = values.map((_, i) => i)
    indexes.sort((a, b) => {
        const x = keys[a] as SortKey
        const y = keys[b] as SortKey
        if (x < y) {
            return -1
        } else if (x > y) {
            return 1
        }
        return a - b
    })
    return indexes.map(i => values[i] as T)
}

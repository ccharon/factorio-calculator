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
import { sorted } from "../core/sort.ts"
import type { Dataset } from "./dataset.ts"
import type { Item } from "./item.ts"

/** Items grouped for the target dropdown: groups, then subgroups, then items, each in game order. */
export type ItemGroups = Item[][][]

/** Sorts items into their groups and subgroups, in the order the game uses. */
export function getItemGroups(items: ReadonlyMap<string, Item>, data: Dataset): ItemGroups {
    const groupMap = new Map<string, Map<string, Item[]>>()
    for (const item of items.values()) {
        let group = groupMap.get(item.group)
        if (group === undefined) {
            group = new Map()
            groupMap.set(item.group, group)
        }
        let subgroup = group.get(item.subgroup)
        if (subgroup === undefined) {
            subgroup = []
            group.set(item.subgroup, subgroup)
        }
        subgroup.push(item)
    }

    const groupOrder = (name: string): string => data.groups[name]?.order ?? ""
    const result: ItemGroups = []
    for (const groupName of sorted(groupMap.keys(), groupOrder)) {
        const subgroups = groupMap.get(groupName) ?? new Map<string, Item[]>()
        const subgroupOrder = (name: string): string => data.groups[groupName]?.subgroups[name] ?? ""
        result.push(sorted(subgroups.keys(), subgroupOrder).map(name => sorted(subgroups.get(name) ?? [], item => item.order)))
    }

    return result
}

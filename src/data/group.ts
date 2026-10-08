// SPDX-FileCopyrightText: 2015-2024 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

import { sorted } from "../core/sort.ts"
import type { Dataset } from "./dataset.ts"
import type { Item } from "./item.ts"

/** Items grouped for the target dropdown: groups, then subgroups, then items, each in game order. */
export type ItemGroups = Item[][][]

/** Sorts items into their groups and subgroups, in the order the game uses. */
export function getItemGroups(items: ReadonlyMap<string, Item>, data: Dataset): ItemGroups {
    const groupMap = new Map<string, Map<string, Item[]>>()
    for (const item of items.values()) {
        // Items in orbit are chosen through the orbit switch of a target.
        if (item.ground !== null) {
            continue
        }
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

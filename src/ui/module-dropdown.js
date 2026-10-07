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
// Dropdown for choosing a module, used for module slots, beacons and the default module settings.
import { makeDropdown, addInputs } from "./dropdown.js"
import { getSprite } from "./icon.ts"

// Renders one dropdown per cell. Each cell has a name and inputRows, a list of rows of inputs
// with module, checked() and choose().
export function moduleDropdown(selector, data) {
    let moduleDropdownSpan = selector.selectAll("span.module-wrapper")
        .data(data)
        .join(
            enter => {
                let s = enter.append("span")
                    .classed("module-wrapper", true)
                makeDropdown(s)
                return s
            }
        )
    let moduleDropdown = moduleDropdownSpan.selectAll("div.dropdown")
    moduleDropdown.selectAll("div.moduleRow")
        .data(d => d.inputRows)
        .join("div")
            .classed("moduleRow", true)
            .selectAll("span.input")
            .data(d => d)
            .join(
                enter => {
                    let s = enter.append("span")
                        .classed("input", true)
                    let label = addInputs(
                        s,
                        d => d.cell.name,
                        d => d.checked(),
                        d => d.choose(),
                    )
                    label.append(function(d) {
                        if (d.module === null) {
                            return getSprite("slot_icon_module").icon.make(32)
                        } else {
                            return d.module.icon.make(32, false, this.parentNode.parentNode.parentNode)
                        }
                    })
                    return s
                },
                update => {
                    update.selectAll("input").property("checked", d => d.checked())
                    return update
                },
            )
}

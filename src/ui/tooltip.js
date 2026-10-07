/*Copyright 2024 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
// Hover tooltips for icons. Positioning uses Floating UI.
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom"
import * as d3 from "d3"

let currentTooltip = null

let tooltipRegistry = new Set()

// A tooltip that opens while the mouse is over its reference element. The content is built
// on first open by calling callback and is reused afterwards.
export class Tooltip {
    // reference: element that opens the tooltip on hover.
    // callback: returns the tooltip content as a DOM node.
    // target: element the tooltip is placed next to. Defaults to reference.
    constructor(reference, callback, target) {
        if (!target) {
            target = reference
        }
        this.reference = reference
        this.callback = callback
        this.target = target
        this.isOpen = false
        this.node = null
        this.stopUpdates = null
        this.addEventListeners()
    }
    // Opens the tooltip and closes any other open one.
    show() {
        if (this.isOpen) {
            return
        }
        if (currentTooltip) {
            currentTooltip.hide()
        }
        this.isOpen = true
        if (!this.node) {
            this.node = this.create()
            document.getElementById("tooltip_container").appendChild(this.node)
            tooltipRegistry.add(this)
        }
        this.node.style.display = "block"
        // Keeps the position current while open, for example when the page scrolls.
        this.stopUpdates = autoUpdate(this.target, this.node, () => this.updatePosition())
        currentTooltip = this
    }
    // Places the tooltip right of the target, or wherever it fits.
    updatePosition() {
        let node = this.node
        void computePosition(this.target, node, {
            placement: "right",
            middleware: [offset(20), flip(), shift({ padding: 4 })],
        }).then(({ x, y }) => {
            node.style.left = `${x}px`
            node.style.top = `${y}px`
        })
    }
    // Closes the tooltip and stops position updates.
    hide() {
        if (!this.isOpen) {
            return
        }
        this.isOpen = false
        this.node.style.display = "none"
        this.stopUpdates()
        this.stopUpdates = null
        if (currentTooltip === this) {
            currentTooltip = null
        }
    }
    // Builds the tooltip element around the content from callback.
    create() {
        let node = document.createElement("div")
        node.classList.add("tooltip")
        node.style.position = "absolute"
        node.appendChild(this.callback())
        return node
    }
    // Removes the tooltip element from the page.
    remove() {
        if (this.isOpen) {
            this.hide()
        }
        if (this.node) {
            d3.select(this.node).remove()
        }
    }
    // Opens on mouseenter and closes on mouseleave of the reference element.
    addEventListeners() {
        this.reference.addEventListener("mouseenter", () => this.show())
        this.reference.addEventListener("mouseleave", () => this.hide())
    }
}

// Removes tooltips whose reference element is no longer in the page.
export function reapTooltips() {
    let toReap = []
    for (let tooltip of tooltipRegistry) {
        if (!document.body.contains(tooltip.reference)) {
            toReap.push(tooltip)
        }
    }
    for (let tooltip of toReap) {
        tooltipRegistry.delete(tooltip)
        tooltip.remove()
    }
}

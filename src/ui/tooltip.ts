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
// Hover tooltips for icons. They open as popovers, placed next to their target with CSS anchor
// positioning (see div.tooltip in calc.css).

let currentTooltip: Tooltip | null = null
let anchorCount = 0

const tooltipRegistry: Set<Tooltip> = new Set()

/**
 * A tooltip that opens while the mouse is over its reference element. The content is built on
 * first open by calling callback and is reused afterwards.
 */
export class Tooltip {
    readonly reference: Element
    readonly target: Element
    private readonly callback: () => Node
    private isOpen = false
    private node: HTMLDivElement | null = null
    // CSS anchor name that ties the popover to its target.
    private readonly anchorName = `--tooltip-${anchorCount++}`

    /**
     * @param reference - Element that opens the tooltip on hover.
     * @param callback - Returns the tooltip content.
     * @param target - Element the tooltip is placed next to. Defaults to reference.
     */
    constructor(reference: Element, callback: () => Node, target?: Element) {
        this.reference = reference
        this.callback = callback
        this.target = target ?? reference
        this.addEventListeners()
    }

    /** Opens the tooltip and closes any other open one. */
    show(): void {
        if (this.isOpen) {
            return
        }
        currentTooltip?.hide()
        this.isOpen = true
        if (this.node === null) {
            this.node = this.create()
            document.getElementById("tooltip_container")?.appendChild(this.node)
            tooltipRegistry.add(this)
        }
        // Several tooltips can share a target, so the target gets the anchor name of the open one.
        if (this.target instanceof HTMLElement || this.target instanceof SVGElement) {
            this.target.style.setProperty("anchor-name", this.anchorName)
        }
        this.node.showPopover()
        // oxlint-disable-next-line typescript/no-this-alias -- records the open tooltip, no closure
        currentTooltip = this
    }

    /** Closes the tooltip and stops position updates. */
    hide(): void {
        if (!this.isOpen) {
            return
        }
        this.isOpen = false
        if (this.node?.isConnected) {
            this.node.hidePopover()
        }
        if (currentTooltip === this) {
            currentTooltip = null
        }
    }

    /** Removes the tooltip element from the page. */
    remove(): void {
        this.hide()
        this.node?.remove()
        this.node = null
    }

    private create(): HTMLDivElement {
        const node = document.createElement("div")
        node.classList.add("tooltip")
        node.popover = "manual"
        node.style.setProperty("position-anchor", this.anchorName)
        node.appendChild(this.callback())
        return node
    }

    private addEventListeners(): void {
        this.reference.addEventListener("mouseenter", () => this.show())
        this.reference.addEventListener("mouseleave", () => this.hide())
    }
}

/** Removes tooltips whose reference element is no longer in the page. */
export function reapTooltips(): void {
    for (const tooltip of Array.from(tooltipRegistry)) {
        if (!document.body.contains(tooltip.reference)) {
            tooltipRegistry.delete(tooltip)
            tooltip.remove()
        }
    }
}

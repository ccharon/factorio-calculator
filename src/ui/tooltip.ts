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

let currentTooltip: Tooltip | null = null

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
    private stopUpdates: (() => void) | null = null

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
        const node = this.node
        node.style.display = "block"
        // Keeps the position current while open, for example when the page scrolls.
        this.stopUpdates = autoUpdate(this.target, node, () => this.updatePosition(node))
        // oxlint-disable-next-line typescript/no-this-alias -- records the open tooltip, no closure
        currentTooltip = this
    }

    /** Closes the tooltip and stops position updates. */
    hide(): void {
        if (!this.isOpen) {
            return
        }
        this.isOpen = false
        if (this.node !== null) {
            this.node.style.display = "none"
        }
        this.stopUpdates?.()
        this.stopUpdates = null
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

    // Places the tooltip right of the target, or wherever it fits.
    private updatePosition(node: HTMLDivElement): void {
        void computePosition(this.target, node, {
            placement: "right",
            middleware: [offset(20), flip(), shift({ padding: 4 })],
        }).then(({ x, y }) => {
            node.style.left = `${x}px`
            node.style.top = `${y}px`
        })
    }

    private create(): HTMLDivElement {
        const node = document.createElement("div")
        node.classList.add("tooltip")
        node.style.position = "absolute"
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

// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Messages about URL settings that the calculator ignored. They show next to the data version.

const messages: string[] = []

/** Records that a URL setting was ignored, logs it and shows it on the page. */
export function warnUrl(message: string, value: string): void {
    console.warn(`ignoring ${message} in URL:`, value)
    messages.push(`Ignored ${message} in the URL: ${value}`)

    const box = document.getElementById("url_warnings")
    if (box === null) {
        return
    }
    box.replaceChildren(...messages.map(text => {
        const line = document.createElement("div")
        line.textContent = text
        return line
    }))
    box.hidden = false
}

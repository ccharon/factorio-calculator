/*Copyright 2026 Christian Charon

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/

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

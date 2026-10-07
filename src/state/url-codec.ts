// Encoding of the settings string in the URL fragment. Long settings are stored as
// "zip=<base64 of raw deflate>", which the browser's CompressionStream produces.

/** Settings from the URL fragment, by name. Values are still URL-encoded where the writer encoded them. */
export type Settings = Map<string, string>

/** Largest decompressed settings string that is accepted, in bytes. */
export const MAX_SETTINGS_BYTES = 1 << 20

async function readStream(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
    const chunks: Uint8Array[] = []
    let total = 0
    const reader = stream.getReader()
    for (;;) {
        const { done, value } = await reader.read()
        if (done) {
            break
        }
        total += value.byteLength
        if (total > maxBytes) {
            await reader.cancel()
            throw new RangeError(`settings larger than ${maxBytes} bytes`)
        }
        chunks.push(value)
    }
    const result = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.byteLength
    }
    return result
}

function toBase64(bytes: Uint8Array): string {
    let binary = ""
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }
    return btoa(binary)
}

function fromBase64(s: string): Uint8Array {
    return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

/** Compresses a string with raw deflate and returns it as base64. */
export async function compress(plain: string): Promise<string> {
    const input = new Blob([plain]).stream().pipeThrough(new CompressionStream("deflate-raw"))
    return toBase64(await readStream(input, Number.MAX_SAFE_INTEGER))
}

/** Reverses compress(). Throws on invalid input or if the result exceeds maxBytes. */
export async function decompress(base64: string, maxBytes: number = MAX_SETTINGS_BYTES): Promise<string> {
    const input = new Blob([fromBase64(base64) as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
    return new TextDecoder().decode(await readStream(input, maxBytes))
}

/** Returns the shorter of the plain settings string and its "zip=" form. */
export async function encodeSettings(plain: string): Promise<string> {
    const zip = "zip=" + await compress(plain)
    return zip.length < plain.length ? zip : plain
}

/** Splits "a=1&b=2" into a map. Pairs without "=" are skipped. */
export function parseSettings(s: string): Settings {
    const settings: Settings = new Map()
    for (const pair of s.split("&")) {
        const i = pair.indexOf("=")
        if (i !== -1) {
            settings.set(pair.slice(0, i), pair.slice(i + 1))
        }
    }
    return settings
}

/**
 * Parses a URL fragment such as "#items=..." or "#zip=...". Invalid compressed data yields
 * empty settings and a console warning.
 */
export async function decodeFragment(fragment: string): Promise<Settings> {
    const settings = parseSettings(fragment.replace(/^#/, ""))
    const zip = settings.get("zip")
    if (zip === undefined) {
        return settings
    }
    try {
        return parseSettings(await decompress(zip))
    } catch (error) {
        console.warn("ignoring invalid settings in URL:", error)
        return new Map()
    }
}

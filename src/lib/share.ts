import { sanitizeDesign } from './sanitize'
import type { Design } from './types'

const PREFIX = '#d='

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function shareUrl(design: Design): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(design))
  const packed = await pipe(json, new CompressionStream('deflate-raw'))
  const base = location.href.split('#')[0]
  return base + PREFIX + toBase64Url(packed)
}

/** Reads a design from the current URL hash, or null when there is none or it is unreadable. */
export async function designFromHash(fallbackFont: string): Promise<Design | null | 'invalid'> {
  if (!location.hash.startsWith(PREFIX)) return null
  try {
    const raw = await pipe(fromBase64Url(location.hash.slice(PREFIX.length)), new DecompressionStream('deflate-raw'))
    return sanitizeDesign(JSON.parse(new TextDecoder().decode(raw)), fallbackFont) ?? 'invalid'
  } catch {
    return 'invalid'
  }
}

export function clearHash(): void {
  history.replaceState(null, '', location.pathname + location.search)
}

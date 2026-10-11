import type { ArtLayer, Decoration, DecoShape, Design, Jitter, Mask, MaskKind, OutlineLayer, TextBlock } from './types'

// Designs arrive from project files and share links, so every field is checked before use.
// Colors in particular end up inside exported SVG markup and must be plain hex values.

const HEX = /^#[0-9a-f]{6}$/i
const ID = /^[^<>"'&\p{Cc}]{1,120}$/u

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const num = (v: unknown, fallback: number, min = -1e5, max = 1e5) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback)
const str = (v: unknown, fallback: string, max = 200) => (typeof v === 'string' ? v.slice(0, max) : fallback)
const id = (v: unknown) => (typeof v === 'string' && ID.test(v) ? v : Math.random().toString(36).slice(2, 9))
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

function block(raw: unknown, fallbackFont: string): TextBlock {
  const b = obj(raw)
  const overrides: TextBlock['overrides'] = {}
  for (const [k, v] of Object.entries(obj(b.overrides))) {
    const i = Number(k)
    if (!Number.isInteger(i) || i < 0 || i > 500) continue
    const o = obj(v)
    overrides[i] = { dx: num(o.dx, 0), dy: num(o.dy, 0), rot: num(o.rot, 0, -3600, 3600), scale: num(o.scale, 1, 0.05, 20) }
  }
  return {
    id: id(b.id),
    text: str(b.text, '', 300),
    fontId: typeof b.fontId === 'string' && ID.test(b.fontId) ? b.fontId : fallbackFont,
    size: num(b.size, 72, 4, 2000),
    tracking: num(b.tracking, 0, -500, 500),
    x: num(b.x, 0),
    y: num(b.y, 0),
    jitter: b.jitter !== false,
    overrides,
  }
}

export function sanitizeLayer(raw: unknown): OutlineLayer {
  const l = obj(raw)
  return {
    id: id(l.id),
    expand: num(l.expand, 10, 0, 400),
    color: color(l.color, '#ffffff'),
    dx: num(l.dx, 0, -400, 400),
    dy: num(l.dy, 0, -400, 400),
    visible: l.visible !== false,
  }
}

export function sanitizeMask(raw: unknown): Mask {
  const m = obj(raw)
  const points = Array.isArray(m.points)
    ? m.points
        .slice(0, 5000)
        .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n)))
        .map(([x, y]) => [num(x, 0), num(y, 0)] as [number, number])
    : []
  return {
    kind: pick<MaskKind>(m.kind, ['none', 'wave', 'zigzag', 'straight', 'freehand'], 'none'),
    color: color(m.color, '#ff9cb8'),
    angle: num(m.angle, 0, -180, 180),
    position: num(m.position, 0.5, 0, 1),
    amplitude: num(m.amplitude, 8, 0, 500),
    wavelength: num(m.wavelength, 150, 8, 5000),
    phase: num(m.phase, 0, 0, 1),
    invert: m.invert === true,
    points,
  }
}

export function sanitizeJitter(raw: unknown): Jitter {
  const j = obj(raw)
  return {
    seed: Math.round(num(j.seed, 7, 0, 1e9)),
    mode: pick(j.mode, ['random', 'alternate'] as const, 'alternate'),
    rotate: num(j.rotate, 6, 0, 90),
    lift: num(j.lift, 8, 0, 400),
    scale: num(j.scale, 0.04, 0, 1),
  }
}

function artLayer(raw: unknown): ArtLayer | null {
  const l = obj(raw)
  if (!Array.isArray(l.contours)) return null
  const contours = l.contours
    .slice(0, 20000)
    .filter((c): c is number[] => Array.isArray(c) && c.length >= 6 && c.length % 2 === 0 && c.every((n) => Number.isFinite(n)))
    .map((c) => c.map((n) => Math.round(num(n, 0, -2000, 2000))))
  return contours.length ? { color: color(l.color, '#000000'), contours } : null
}

function decoration(raw: unknown): Decoration | null {
  const d = obj(raw)
  const shape = pick<DecoShape | 'art'>(d.shape, ['heart', 'star', 'sparkle', 'dot', 'flower', 'art'], 'heart')
  const base: Decoration = {
    id: id(d.id),
    shape,
    x: num(d.x, 0),
    y: num(d.y, 0),
    size: num(d.size, 60, 1, 5000),
    rot: num(d.rot, 0, -3600, 3600),
    color: color(d.color, '#ffd45c'),
  }
  if (shape !== 'art') return base
  const a = obj(d.art)
  const layers = Array.isArray(a.layers) ? a.layers.slice(0, 16).map(artLayer).filter((l): l is ArtLayer => !!l) : []
  if (!layers.length) return null
  return { ...base, art: { name: str(a.name, 'Artwork', 120), layers, oneColor: a.oneColor === true } }
}

export function sanitizeDesign(raw: unknown, fallbackFont: string): Design | null {
  const d = obj(raw)
  if (d.version !== 1 || !Array.isArray(d.blocks) || d.blocks.length === 0) return null
  return {
    version: 1,
    blocks: d.blocks.slice(0, 20).map((b) => block(b, fallbackFont)),
    fill: color(d.fill, '#e8435f'),
    jitter: sanitizeJitter(d.jitter),
    layers: Array.isArray(d.layers) ? d.layers.slice(0, 20).map(sanitizeLayer) : [],
    mask: sanitizeMask(d.mask),
    decorations: Array.isArray(d.decorations)
      ? d.decorations.slice(0, 200).map(decoration).filter((x): x is Decoration => !!x)
      : [],
    previewBg: pick(d.previewBg, ['checker', 'light', 'dark'] as const, 'checker'),
  }
}

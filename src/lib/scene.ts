import type { Font, Glyph } from 'opentype.js'
import {
  bounds,
  flattenCommands,
  intersect,
  offset,
  pivotTransform,
  shift,
  simplify,
  toPathD,
  toPolys,
  union,
  unionBoxes,
  type Contour,
  type Mat,
} from './geometry'
import { decorationLayers } from './shapes'
import { maskContour } from './mask'
import type { Box, Design, Jitter, LetterOverride, Polys, TextBlock } from './types'

export interface LetterGeom {
  blockId: string
  index: number
  char: string
  d: string
  box: Box
  cx: number
  cy: number
}

export interface DecoGeom {
  id: string
  /** Outline of the whole decoration, used for hit testing. */
  d: string
  parts: { d: string; color: string }[]
  box: Box
  cx: number
  cy: number
}

export interface Scene {
  letters: LetterGeom[]
  decos: DecoGeom[]
  layers: { id: string; d: string; color: string }[]
  /** Union of all letters, used for emptiness checks and the two-tone cut. */
  fillD: string
  /** What is painted: one path when every letter shares a colour, else one path per letter in order. */
  fills: { d: string; color: string }[]
  maskD: string
  maskColor: string
  textBox: Box | null
  viewBox: Box
  missingGlyphs: string[]
}

export const NO_OVERRIDE: LetterOverride = { dx: 0, dy: 0, rot: 0, scale: 1 }

const glyphCache = new WeakMap<Font, Map<string, Contour[]>>()

function glyphContours(font: Font, glyph: Glyph, size: number): Contour[] {
  let perFont = glyphCache.get(font)
  if (!perFont) glyphCache.set(font, (perFont = new Map()))
  const key = glyph.index + ':' + size
  let c = perFont.get(key)
  if (!c) {
    c = flattenCommands(glyph.getPath(0, 0, size).commands)
    perFont.set(key, c)
  }
  return c
}

// Placed letters are cached so dragging one letter only rebuilds that letter.
const placedCache = new WeakMap<Font, Map<string, { polys: Polys; d: string; box: Box | null }>>()

function placeGlyph(font: Font, glyph: Glyph, size: number, x: number, y: number, m: Mat) {
  let perFont = placedCache.get(font)
  if (!perFont) placedCache.set(font, (perFont = new Map()))
  const key = `${glyph.index}|${size}|${x}|${y}|${m.join()}`
  let hit = perFont.get(key)
  if (!hit) {
    const local = glyphContours(font, glyph, size).map((c) => c.map(([px, py]) => [px + x, py + y] as [number, number]))
    const polys = union(toPolys(local, m))
    hit = { polys, d: toPathD(polys), box: bounds(polys) }
    if (perFont.size > 2000) perFont.clear()
    perFont.set(key, hit)
  }
  return hit
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function jitterFor(j: Jitter, blockIndex: number, count: number) {
  const rand = mulberry32(j.seed * 31 + blockIndex * 977)
  const out: { rot: number; lift: number; scale: number }[] = []
  for (let i = 0; i < count; i++) {
    const r1 = rand() * 2 - 1
    const r2 = rand() * 2 - 1
    const r3 = rand() * 2 - 1
    if (j.mode === 'alternate') {
      // Letters bob up and down in turn and tilt away from each other, with a little noise.
      const sign = i % 2 === 0 ? -1 : 1
      out.push({
        rot: j.rotate * (sign * 0.75 + r1 * 0.25),
        lift: j.lift * (sign * 0.75 + r2 * 0.25),
        scale: 1 + j.scale * r3,
      })
    } else {
      out.push({ rot: j.rotate * r1, lift: j.lift * r2, scale: 1 + j.scale * r3 })
    }
  }
  return out
}

const SPACE = /\s/

function layoutBlock(
  block: TextBlock,
  blockIndex: number,
  font: Font,
  fallback: Font | undefined,
  jitter: Jitter,
  missing: Set<string>,
): { letters: LetterGeom[]; polys: Polys } {
  const chars = Array.from(block.text)
  const glyphs = chars.map((ch) => {
    let f = font
    let g = font.charToGlyph(ch)
    if (g.index === 0 && !SPACE.test(ch)) {
      if (fallback && fallback !== font && fallback.charToGlyph(ch).index !== 0) {
        f = fallback
        g = fallback.charToGlyph(ch)
      } else missing.add(ch)
    }
    return { ch, f, g }
  })

  const advances = glyphs.map(({ f, g }) => ((g.advanceWidth ?? f.unitsPerEm) * block.size) / f.unitsPerEm)
  const total = advances.reduce((a, b) => a + b, 0) + block.tracking * Math.max(0, chars.length - 1)
  const jit = jitterFor(jitter, blockIndex, chars.length)

  const letters: LetterGeom[] = []
  const polys: Polys = []
  let pen = block.x - total / 2
  glyphs.forEach(({ ch, f, g }, i) => {
    const adv = advances[i]
    if (!SPACE.test(ch)) {
      const ov = block.overrides[i] ?? NO_OVERRIDE
      const j = block.jitter ? jit[i] : { rot: 0, lift: 0, scale: 1 }
      // Pivot sits near the visual middle of a typical glyph, above the baseline.
      const cx = pen + adv / 2
      const cy = block.y - block.size * 0.36
      const m = pivotTransform(cx, cy, j.rot + ov.rot, j.scale * ov.scale, ov.dx, j.lift + ov.dy)
      const placed = placeGlyph(f, g, block.size, pen, block.y, m)
      if (placed.box) {
        polys.push(...placed.polys)
        letters.push({ blockId: block.id, index: i, char: ch, d: placed.d, box: placed.box, cx: cx + ov.dx, cy: cy + j.lift + ov.dy })
      }
    }
    pen += adv + block.tracking
  })
  return { letters, polys }
}

type Grown = { polys: Polys; d: string; box: Box | null }

/** Small least-recently-used cache. Style previews build their own scenes next to the canvas. */
class Lru<V> {
  #map = new Map<string, V>()
  #size: number
  constructor(size: number) {
    this.#size = size
  }
  get(key: string): V | undefined {
    const v = this.#map.get(key)
    if (v !== undefined) {
      this.#map.delete(key)
      this.#map.set(key, v)
    }
    return v
  }
  set(key: string, v: V): V {
    this.#map.set(key, v)
    if (this.#map.size > this.#size) this.#map.delete(this.#map.keys().next().value!)
    return v
  }
}

interface TextPart {
  letters: LetterGeom[]
  fill: Polys
  fillD: string
  textBox: Box | null
  missing: string[]
}

// Each stage is keyed on the inputs that shape it, so colour edits, shadow shifts and
// two-tone tweaks reuse the expensive geometry instead of rebuilding it.
const textCache = new Lru<TextPart>(12)
const silhouetteCache = new Lru<{ polys: Polys; grown: Map<number, Grown> }>(12)
const maskCache = new Lru<string>(12)

const decoCache = new WeakMap<object, { key: string; polys: Polys; geom: DecoGeom }>()

function decorationGeom(d: Design['decorations'][number]): { key: string; polys: Polys; geom: DecoGeom } {
  const key = [d.id, d.shape, d.x, d.y, d.size, d.rot, d.color, d.art?.oneColor, d.art?.layers.map((l) => l.color).join()].join('|')
  const hit = decoCache.get(d)
  if (hit && hit.key === key) return hit
  const layers = decorationLayers(d)
  const all = layers.length === 1 ? layers[0].polys : union(layers.flatMap((l) => l.polys))
  const allD = toPathD(all)
  const entry = {
    key,
    polys: all,
    geom: {
      id: d.id,
      d: allD,
      parts: layers.map((l) => ({ d: layers.length === 1 ? allD : toPathD(l.polys), color: l.color })),
      box: bounds(all) ?? { x: d.x, y: d.y, w: 0, h: 0 },
      cx: d.x,
      cy: d.y,
    },
  }
  decoCache.set(d, entry)
  return entry
}

function textPart(design: Design, loaded: Record<string, Font>, fallbackId: string): { key: string; part: TextPart } {
  const fonts = design.blocks.map((b) => (loaded[b.fontId] ? b.fontId : loaded[fallbackId] ? fallbackId : '-'))
  // Letter colours don't change any shape, so they stay out of the key and never trigger a rebuild.
  const key = JSON.stringify([design.blocks, design.jitter, fonts], (k, v) => (k === 'color' ? undefined : v))
  const hit = textCache.get(key)
  if (hit) return { key, part: hit }

  const missing = new Set<string>()
  const letters: LetterGeom[] = []
  const textPolys: Polys = []
  const fallback = loaded[fallbackId]
  design.blocks.forEach((block, bi) => {
    const font = loaded[block.fontId] ?? fallback
    if (!font || !block.text) return
    const r = layoutBlock(block, bi, font, fallback, design.jitter, missing)
    letters.push(...r.letters)
    textPolys.push(...r.polys)
  })
  const fill = union(textPolys)
  return { key, part: textCache.set(key, { letters, fill, fillD: toPathD(fill), textBox: bounds(fill), missing: [...missing] }) }
}

function letterFills(design: Design, letters: LetterGeom[], unionD: string): { d: string; color: string }[] {
  if (!letters.length) return []
  const byId = new Map(design.blocks.map((b) => [b.id, b]))
  const { on, colors, restart } = design.pattern
  let k = 0
  let line = ''
  const resolved = letters.map((l) => {
    if (restart && l.blockId !== line) k = 0
    line = l.blockId
    const base = on && colors.length ? colors[k % colors.length] : design.fill
    k++
    return byId.get(l.blockId)?.overrides[l.index]?.color ?? base
  })
  if (resolved.every((c) => c === resolved[0])) return [{ d: unionD, color: resolved[0] }]
  return letters.map((l, i) => ({ d: l.d, color: resolved[i] }))
}

export function buildScene(design: Design, loaded: Record<string, Font>, fallbackId: string): Scene {
  const text = textPart(design, loaded, fallbackId)
  const { letters, fill, textBox } = text.part

  const decoGeoms = design.decorations.map(decorationGeom)
  const decos = decoGeoms.map((g) => g.geom)

  const silKey = text.key + '#' + decoGeoms.map((g) => g.key).join('#')
  const sil =
    silhouetteCache.get(silKey) ??
    silhouetteCache.set(silKey, { polys: union([...fill, ...decoGeoms.flatMap((g) => g.polys)]), grown: new Map() })

  const visible = design.layers.filter((l) => l.visible)
  // An outline is several px wide, so sub-pixel detail in its input never shows; dropping it
  // cuts the offset cost several times over.
  let simple: Polys | null = null
  for (const l of visible) {
    if (sil.grown.has(l.expand)) continue
    simple ??= simplify(sil.polys, 0.35)
    const polys = offset(simple, l.expand, 0.3)
    sil.grown.set(l.expand, { polys, d: toPathD(polys), box: bounds(polys) })
  }

  const layerPolys = visible.map((l) => {
    const g = sil.grown.get(l.expand)!
    const box = g.box && { ...g.box, x: g.box.x + l.dx, y: g.box.y + l.dy }
    return { l, d: l.dx || l.dy ? toPathD(shift(g.polys, l.dx, l.dy)) : g.d, box }
  })
  // The first layer in the list sits right under the fill, so paint them in reverse.
  const layers = layerPolys.map(({ l, d }) => ({ id: l.id, d, color: l.color })).reverse()

  let maskD = ''
  if (design.mask.kind !== 'none' && textBox) {
    const { color: _, ...shape } = design.mask
    const mKey = text.key + '#' + JSON.stringify(shape)
    const cached = maskCache.get(mKey)
    if (cached !== undefined) maskD = cached
    else {
      const region = maskContour(design.mask, textBox)
      maskD = maskCache.set(mKey, region ? toPathD(intersect(fill, toPolys([region]))) : '')
    }
  }

  const box = unionBoxes([textBox, ...decos.map((d) => d.box), ...layerPolys.map(({ box }) => box)]) ?? {
    x: -200,
    y: -120,
    w: 400,
    h: 200,
  }
  const pad = 24
  return {
    letters,
    decos,
    layers,
    fillD: text.part.fillD,
    fills: letterFills(design, letters, text.part.fillD),
    maskD,
    maskColor: design.mask.color,
    textBox,
    viewBox: { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 },
    missingGlyphs: text.part.missing,
  }
}

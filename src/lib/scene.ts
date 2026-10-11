import type { Font, Glyph } from 'opentype.js'
import {
  bounds,
  flattenCommands,
  intersect,
  offset,
  pivotTransform,
  shift,
  toPathD,
  toPolys,
  union,
  unionBoxes,
  type Contour,
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
  fillD: string
  fillColor: string
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
      const local = glyphContours(f, g, block.size).map((c) => c.map(([x, y]) => [x + pen, y + block.y] as [number, number]))
      const p = union(toPolys(local, m))
      const box = bounds(p)
      if (box) {
        polys.push(...p)
        letters.push({ blockId: block.id, index: i, char: ch, d: toPathD(p), box, cx: cx + ov.dx, cy: cy + j.lift + ov.dy })
      }
    }
    pen += adv + block.tracking
  })
  return { letters, polys }
}

export function buildScene(design: Design, loaded: Record<string, Font>, fallbackId: string): Scene {
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
  const textBox = bounds(fill)

  const decoPolys: Polys = []
  const decos: DecoGeom[] = design.decorations.map((d) => {
    const layers = decorationLayers(d)
    const all = layers.length === 1 ? layers[0].polys : union(layers.flatMap((l) => l.polys))
    decoPolys.push(...all)
    return {
      id: d.id,
      d: toPathD(all),
      parts: layers.map((l) => ({ d: layers.length === 1 ? toPathD(all) : toPathD(l.polys), color: l.color })),
      box: bounds(all) ?? { x: d.x, y: d.y, w: 0, h: 0 },
      cx: d.x,
      cy: d.y,
    }
  })

  const silhouette = union([...fill, ...decoPolys])

  const layerPolys = design.layers
    .filter((l) => l.visible)
    .map((l) => ({ l, p: shift(offset(silhouette, l.expand), l.dx, l.dy) }))
  // The first layer in the list sits right under the fill, so paint them in reverse.
  const layers = layerPolys.map(({ l, p }) => ({ id: l.id, d: toPathD(p), color: l.color })).reverse()

  let maskD = ''
  if (design.mask.kind !== 'none' && textBox) {
    const region = maskContour(design.mask, textBox)
    if (region) maskD = toPathD(intersect(fill, toPolys([region])))
  }

  const box = unionBoxes([textBox, ...decos.map((d) => d.box), ...layerPolys.map(({ p }) => bounds(p))]) ?? {
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
    fillD: toPathD(fill),
    fillColor: design.fill,
    maskD,
    maskColor: design.mask.color,
    textBox,
    viewBox: { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 },
    missingGlyphs: [...missing],
  }
}

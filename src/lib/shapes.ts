import { offset, pivotTransform, toPolys, transformPolys, union, type Contour } from './geometry'
import type { ArtLayer, Decoration, DecoShape, Polys } from './types'

const STEPS = 96

function sample(fn: (t: number) => [number, number]): Contour {
  const out: Contour = []
  for (let i = 0; i < STEPS; i++) out.push(fn((i / STEPS) * Math.PI * 2))
  return out
}

function circle(cx: number, cy: number, r: number): Contour {
  return sample((t) => [cx + r * Math.cos(t), cy + r * Math.sin(t)])
}

// Every shape is drawn around (0, 0) and spans about one unit.
const UNIT_SHAPES: Record<DecoShape, () => Contour[]> = {
  heart: () => [
    sample((t) => {
      const x = 16 * Math.sin(t) ** 3
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      return [x / 33, -y / 33 - 0.05]
    }),
  ],
  star: () => {
    const pts: Contour = []
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 === 0 ? 0.52 : 0.24
      pts.push([r * Math.cos(a), r * Math.sin(a) + 0.04])
    }
    return [pts]
  },
  sparkle: () => [
    sample((t) => {
      const c = Math.cos(t)
      const s = Math.sin(t)
      return [0.5 * Math.sign(c) * Math.abs(c) ** 2.6, 0.5 * Math.sign(s) * Math.abs(s) ** 2.6]
    }),
  ],
  dot: () => [circle(0, 0, 0.5)],
  flower: () => {
    const petals: Contour[] = [circle(0, 0, 0.2)]
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
      petals.push(circle(0.27 * Math.cos(a), 0.27 * Math.sin(a), 0.22))
    }
    return petals
  },
}

// Shapes with sharp corners get rounded so they sit with the soft lettering.
const ROUNDING: Partial<Record<DecoShape, number>> = { star: 0.06 }

export const SHAPE_LABELS: Record<DecoShape, string> = {
  heart: 'Heart',
  star: 'Star',
  sparkle: 'Sparkle',
  dot: 'Dot',
  flower: 'Flower',
}

const ART_UNITS = 1000

/** Each painted part of a decoration, in paint order. */
export function decorationLayers(d: Decoration): { polys: Polys; color: string }[] {
  if (d.shape === 'art') {
    if (!d.art) return []
    const m = pivotTransform(0, 0, d.rot, d.size / ART_UNITS, d.x, d.y)
    const base = artBase(d.art.layers)
    if (d.art.oneColor) return [{ polys: transformPolys(base.merged, m), color: d.color }]
    return d.art.layers.map((l, i) => ({ polys: transformPolys(base.layers[i], m), color: l.color }))
  }
  const m = pivotTransform(0, 0, d.rot, d.size, d.x, d.y)
  let polys = union(toPolys(UNIT_SHAPES[d.shape](), m))
  const r = ROUNDING[d.shape]
  if (r) polys = offset(offset(polys, -r * d.size), r * d.size)
  return [{ polys, color: d.color }]
}

// Traced artwork can hold thousands of points, so its unions are computed once per artwork
// and only the placement transform is applied on each render.
const artCache = new WeakMap<ArtLayer[], { layers: Polys[]; merged: Polys }>()

function artBase(layers: ArtLayer[]) {
  let hit = artCache.get(layers)
  if (!hit) {
    const unit = layers.map((l) => union(toPolys(l.contours.map(pairs))))
    hit = { layers: unit, merged: union(unit.flat()) }
    artCache.set(layers, hit)
  }
  return hit
}

function pairs(flat: number[]): Contour {
  const out: Contour = []
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]])
  return out
}

/** A small path in a 0..24 box, for buttons. */
export function shapeIcon(shape: DecoShape): string {
  return UNIT_SHAPES[shape]()
    .map((c) => 'M' + c.map(([x, y]) => `${(12 + x * 20).toFixed(1)} ${(12 + y * 20).toFixed(1)}`).join('L') + 'Z')
    .join('')
}

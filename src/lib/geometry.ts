import ClipperLib from 'clipper-lib'
import type { Box, Polys } from './types'

// Clipper works on integers, so float px coordinates are scaled up by this factor.
export const SCALE = 64

export type Contour = [number, number][]
export type Mat = [number, number, number, number, number, number]

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

export function multiply(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y]
export const scaling = (s: number): Mat => [s, 0, 0, s, 0, 0]
export function rotation(deg: number): Mat {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [c, s, -s, c, 0, 0]
}

/** Rotate and scale around (cx, cy), then move by (dx, dy). */
export function pivotTransform(cx: number, cy: number, rot: number, scale: number, dx = 0, dy = 0): Mat {
  return multiply(translate(cx + dx, cy + dy), multiply(rotation(rot), multiply(scaling(scale), translate(-cx, -cy))))
}

export function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

type Cmd =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' }

// Curves are split into segments of roughly this many px.
const SEGMENT_PX = 2.5

/** Flatten opentype.js path commands into closed polygons. */
export function flattenCommands(commands: readonly unknown[]): Contour[] {
  const out: Contour[] = []
  let cur: Contour = []
  let px = 0
  let py = 0
  for (const raw of commands as Cmd[]) {
    switch (raw.type) {
      case 'M':
        if (cur.length > 2) out.push(cur)
        cur = [[raw.x, raw.y]]
        px = raw.x
        py = raw.y
        break
      case 'L':
        cur.push([raw.x, raw.y])
        px = raw.x
        py = raw.y
        break
      case 'Q': {
        const len = Math.hypot(raw.x1 - px, raw.y1 - py) + Math.hypot(raw.x - raw.x1, raw.y - raw.y1)
        const n = Math.min(48, Math.max(2, Math.ceil(len / SEGMENT_PX)))
        for (let i = 1; i <= n; i++) {
          const t = i / n
          const u = 1 - t
          cur.push([u * u * px + 2 * u * t * raw.x1 + t * t * raw.x, u * u * py + 2 * u * t * raw.y1 + t * t * raw.y])
        }
        px = raw.x
        py = raw.y
        break
      }
      case 'C': {
        const len =
          Math.hypot(raw.x1 - px, raw.y1 - py) +
          Math.hypot(raw.x2 - raw.x1, raw.y2 - raw.y1) +
          Math.hypot(raw.x - raw.x2, raw.y - raw.y2)
        const n = Math.min(64, Math.max(2, Math.ceil(len / SEGMENT_PX)))
        for (let i = 1; i <= n; i++) {
          const t = i / n
          const u = 1 - t
          const a = u * u * u
          const b = 3 * u * u * t
          const c = 3 * u * t * t
          const d = t * t * t
          cur.push([a * px + b * raw.x1 + c * raw.x2 + d * raw.x, a * py + b * raw.y1 + c * raw.y2 + d * raw.y])
        }
        px = raw.x
        py = raw.y
        break
      }
      case 'Z':
        if (cur.length > 2) out.push(cur)
        cur = []
        break
    }
  }
  if (cur.length > 2) out.push(cur)
  return out
}

export function toPolys(contours: Contour[], m: Mat = IDENTITY): Polys {
  return contours.map((c) =>
    c.map(([x, y]) => {
      const [tx, ty] = applyMat(m, x, y)
      return { X: Math.round(tx * SCALE), Y: Math.round(ty * SCALE) }
    }),
  )
}

function clip(type: number, subject: Polys, clipPolys?: Polys): Polys {
  const c = new ClipperLib.Clipper()
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true)
  if (clipPolys) c.AddPaths(clipPolys, ClipperLib.PolyType.ptClip, true)
  const solution: Polys = []
  // Font outlines rely on the nonzero winding rule for overlapping contours.
  c.Execute(type, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return solution
}

export const union = (polys: Polys): Polys => clip(ClipperLib.ClipType.ctUnion, polys)
export const intersect = (a: Polys, b: Polys): Polys => clip(ClipperLib.ClipType.ctIntersection, a, b)

/** Grow (or shrink, with a negative delta) a shape by `px` with round joins. */
export function offset(polys: Polys, px: number, arcTolerance = 0.25): Polys {
  if (px === 0 || polys.length === 0) return polys
  const co = new ClipperLib.ClipperOffset(2, arcTolerance * SCALE)
  co.AddPaths(polys, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const solution: Polys = []
  co.Execute(solution, px * SCALE)
  return solution
}

/** Drop vertices that sit within `px` of their neighbours; offsetting cost scales with vertex count. */
export function simplify(polys: Polys, px: number): Polys {
  return ClipperLib.Clipper.CleanPolygons(polys, px * SCALE).filter((p) => p.length > 2)
}

export function transformPolys(polys: Polys, m: Mat): Polys {
  return polys.map((p) =>
    p.map((q) => {
      const [x, y] = applyMat(m, q.X / SCALE, q.Y / SCALE)
      return { X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }
    }),
  )
}

export function shift(polys: Polys, dx: number, dy: number): Polys {
  if (dx === 0 && dy === 0) return polys
  const ox = Math.round(dx * SCALE)
  const oy = Math.round(dy * SCALE)
  return polys.map((p) => p.map((q) => ({ X: q.X + ox, Y: q.Y + oy })))
}

export function bounds(polys: Polys): Box | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of polys)
    for (const q of p) {
      if (q.X < minX) minX = q.X
      if (q.Y < minY) minY = q.Y
      if (q.X > maxX) maxX = q.X
      if (q.Y > maxY) maxY = q.Y
    }
  if (minX === Infinity) return null
  return { x: minX / SCALE, y: minY / SCALE, w: (maxX - minX) / SCALE, h: (maxY - minY) / SCALE }
}

export function unionBoxes(boxes: (Box | null)[]): Box | null {
  const list = boxes.filter((b): b is Box => b !== null)
  if (list.length === 0) return null
  const x = Math.min(...list.map((b) => b.x))
  const y = Math.min(...list.map((b) => b.y))
  const r = Math.max(...list.map((b) => b.x + b.w))
  const btm = Math.max(...list.map((b) => b.y + b.h))
  return { x, y, w: r - x, h: btm - y }
}

const fmt = (v: number) => String(Math.round((v / SCALE) * 100) / 100)

export function toPathD(polys: Polys): string {
  let d = ''
  for (const p of polys) {
    if (p.length < 3) continue
    d += 'M' + fmt(p[0].X) + ' ' + fmt(p[0].Y)
    for (let i = 1; i < p.length; i++) d += 'L' + fmt(p[i].X) + ' ' + fmt(p[i].Y)
    d += 'Z'
  }
  return d
}

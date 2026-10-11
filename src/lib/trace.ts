import ClipperLib from 'clipper-lib'

export type TraceMode = 'silhouette' | 'colors'

export interface TraceOptions {
  mode: TraceMode
  /** Alpha cut for transparent images, brightness cut for opaque ones (0..255). */
  threshold: number
  invert: boolean
  colors: number
  removeBg: boolean
  /** 0 keeps hard pixel edges; each step adds two smoothing passes. */
  smooth: number
  /** Loops (and holes) smaller than this many square pixels are dropped. */
  speck: number
}

export interface TraceInput {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface TraceLayer {
  color: string
  area: number
  /** Flat [x0, y0, x1, y1, ...] in source pixels. */
  contours: number[][]
}

export interface TraceResult {
  width: number
  height: number
  hasAlpha: boolean
  layers: TraceLayer[]
  points: number
}

const CLIP_SCALE = 16

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

function detectAlpha(img: TraceInput): boolean {
  let clear = 0
  const n = img.width * img.height
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) clear++
  return clear > n * 0.005
}

/** Directed pixel-edge loops around the set pixels, with the inside on the right in screen space. */
function maskLoops(mask: Uint8Array, w: number, h: number): Int32Array[] {
  const W1 = w + 1
  const outA = new Int32Array(W1 * (h + 1)).fill(-1)
  const outB = new Int32Array(W1 * (h + 1)).fill(-1)
  const add = (from: number, to: number) => {
    if (outA[from] < 0) outA[from] = to
    else outB[from] = to
  }
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue
      const tl = y * W1 + x
      const tr = tl + 1
      const bl = tl + W1
      const br = bl + 1
      if (!at(x, y - 1)) add(tl, tr)
      if (!at(x + 1, y)) add(tr, br)
      if (!at(x, y + 1)) add(br, bl)
      if (!at(x - 1, y)) add(bl, tl)
    }

  // Every boundary vertex has as many edges in as out, so following unused edges always closes.
  // Which edge is taken at a pinch point does not matter: the even-odd area stays the same.
  const loops: Int32Array[] = []
  const buf: number[] = []
  for (let s = 0; s < outA.length; s++) {
    while (outA[s] >= 0 || outB[s] >= 0) {
      buf.length = 0
      let cur = s
      do {
        let next: number
        if (outA[cur] >= 0) {
          next = outA[cur]
          outA[cur] = -1
        } else {
          next = outB[cur]
          outB[cur] = -1
        }
        buf.push(cur % W1, (cur / W1) | 0)
        cur = next
      } while (cur !== s)
      loops.push(Int32Array.from(buf))
    }
  }
  return loops
}

function loopArea(p: ArrayLike<number>): number {
  let a = 0
  const n = p.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    a += p[i] * p[j + 1] - p[j] * p[i + 1]
  }
  return a / 2
}

function smoothLoop(src: ArrayLike<number>, passes: number): Float64Array {
  let p = Float64Array.from(src)
  const n = p.length / 2
  if (n < 4) return p
  let q = new Float64Array(p.length)
  for (let k = 0; k < passes; k++) {
    for (let i = 0; i < n; i++) {
      const a = ((i - 1 + n) % n) * 2
      const b = i * 2
      const c = ((i + 1) % n) * 2
      q[b] = (p[a] + 2 * p[b] + p[c]) / 4
      q[b + 1] = (p[a + 1] + 2 * p[b + 1] + p[c + 1]) / 4
    }
    ;[p, q] = [q, p]
  }
  return p
}

/** Ramer-Douglas-Peucker on a closed loop. */
function simplifyLoop(p: ArrayLike<number>, eps: number): number[] {
  const n = p.length / 2
  if (n < 4) return Array.from(p)
  let far = 0
  let best = -1
  for (let i = 1; i < n; i++) {
    const d = (p[i * 2] - p[0]) ** 2 + (p[i * 2 + 1] - p[1]) ** 2
    if (d > best) {
      best = d
      far = i
    }
  }
  const keep = new Uint8Array(n + 1)
  keep[0] = keep[far] = keep[n] = 1
  const px = (i: number) => p[(i % n) * 2]
  const py = (i: number) => p[(i % n) * 2 + 1]
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = px(a)
    const ay = py(a)
    const dx = px(b) - ax
    const dy = py(b) - ay
    const len = Math.hypot(dx, dy) || 1
    let idx = -1
    let max = eps
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((px(i) - ax) * dy - (py(i) - ay) * dx) / len
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (idx >= 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1])
  return out
}

function maskToContours(mask: Uint8Array, w: number, h: number, o: TraceOptions, grow: number): number[][] {
  const paths: { X: number; Y: number }[][] = []
  for (const loop of maskLoops(mask, w, h)) {
    if (Math.abs(loopArea(loop)) < Math.max(1, o.speck)) continue
    const smooth = o.smooth > 0 ? smoothLoop(loop, o.smooth * 2) : loop
    const pts = simplifyLoop(smooth, o.smooth > 0 ? 0.3 : 0.01)
    if (pts.length < 6) continue
    const path: { X: number; Y: number }[] = []
    for (let i = 0; i < pts.length; i += 2) path.push({ X: Math.round(pts[i] * CLIP_SCALE), Y: Math.round(pts[i + 1] * CLIP_SCALE) })
    paths.push(path)
  }
  if (!paths.length) return []

  const c = new ClipperLib.Clipper()
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true)
  let solution: { X: number; Y: number }[][] = []
  c.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd)
  if (grow > 0) {
    const co = new ClipperLib.ClipperOffset(2, 0.1 * CLIP_SCALE)
    co.AddPaths(solution, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
    const grown: typeof solution = []
    co.Execute(grown, grow * CLIP_SCALE)
    solution = grown
  }
  return solution.map((p) => p.flatMap((q) => [q.X / CLIP_SCALE, q.Y / CLIP_SCALE]))
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

/** Most common color along the image border, used as the background of opaque images. */
function borderColor(img: TraceInput): [number, number, number] {
  const { width: w, height: h, data } = img
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  const visit = (x: number, y: number) => {
    const i = (y * w + x) * 4
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bin.n++
    bin.r += data[i]
    bin.g += data[i + 1]
    bin.b += data[i + 2]
    bins.set(key, bin)
  }
  for (let x = 0; x < w; x++) {
    visit(x, 0)
    visit(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    visit(0, y)
    visit(w - 1, y)
  }
  let top = { n: 0, r: 255, g: 255, b: 255 }
  for (const bin of bins.values()) if (bin.n > top.n) top = bin
  return [top.r / top.n, top.g / top.n, top.b / top.n]
}

function kmeans(samples: Float64Array, k: number, rand: () => number): Float64Array {
  const n = samples.length / 3
  const centers = new Float64Array(k * 3)
  const dist = new Float64Array(n).fill(Infinity)
  let pick = Math.floor(rand() * n)
  for (let c = 0; c < k; c++) {
    centers.set(samples.subarray(pick * 3, pick * 3 + 3), c * 3)
    let sum = 0
    for (let i = 0; i < n; i++) {
      const d =
        (samples[i * 3] - centers[c * 3]) ** 2 +
        (samples[i * 3 + 1] - centers[c * 3 + 1]) ** 2 +
        (samples[i * 3 + 2] - centers[c * 3 + 2]) ** 2
      if (d < dist[i]) dist[i] = d
      sum += dist[i]
    }
    let r = rand() * sum
    pick = 0
    for (let i = 0; i < n; i++) {
      r -= dist[i]
      if (r <= 0) {
        pick = i
        break
      }
    }
  }
  const acc = new Float64Array(k * 4)
  for (let iter = 0; iter < 12; iter++) {
    acc.fill(0)
    for (let i = 0; i < n; i++) {
      const c = nearest(centers, k, samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2])
      acc[c * 4] += samples[i * 3]
      acc[c * 4 + 1] += samples[i * 3 + 1]
      acc[c * 4 + 2] += samples[i * 3 + 2]
      acc[c * 4 + 3]++
    }
    for (let c = 0; c < k; c++) {
      const m = acc[c * 4 + 3]
      if (m) centers.set([acc[c * 4] / m, acc[c * 4 + 1] / m, acc[c * 4 + 2] / m], c * 3)
    }
  }
  return centers
}

function nearest(centers: Float64Array, k: number, r: number, g: number, b: number): number {
  let best = 0
  let bd = Infinity
  for (let c = 0; c < k; c++) {
    const d = (r - centers[c * 3]) ** 2 + (g - centers[c * 3 + 1]) ** 2 + (b - centers[c * 3 + 2]) ** 2
    if (d < bd) {
      bd = d
      best = c
    }
  }
  return best
}

export function trace(img: TraceInput, o: TraceOptions): TraceResult {
  const { width: w, height: h, data } = img
  const n = w * h
  const hasAlpha = detectAlpha(img)
  const layers: TraceLayer[] = []

  if (o.mode === 'silhouette') {
    const mask = new Uint8Array(n)
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (let i = 0; i < n; i++) {
      const p = i * 4
      const value = hasAlpha ? data[p + 3] : 255 - (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2])
      let inside = hasAlpha ? value >= o.threshold : value > 255 - o.threshold
      if (o.invert) inside = !inside
      if (inside) {
        mask[i] = 1
        r += data[p]
        g += data[p + 1]
        b += data[p + 2]
        count++
      }
    }
    const contours = maskToContours(mask, w, h, o, 0)
    if (contours.length) layers.push({ color: count ? hex(r / count, g / count, b / count) : '#000000', area: count, contours })
  } else {
    const bg = !hasAlpha && o.removeBg ? borderColor(img) : null
    const candidate = new Uint8Array(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      const p = i * 4
      if (data[p + 3] < 128) continue
      if (bg && (data[p] - bg[0]) ** 2 + (data[p + 1] - bg[1]) ** 2 + (data[p + 2] - bg[2]) ** 2 < 48 * 48) continue
      candidate[i] = 1
      total++
    }
    if (total > 0) {
      // Colors are learned from flat areas only, so anti-aliased edge pixels don't become a color of their own.
      const flat = new Uint8Array(n)
      let flatCount = 0
      for (let i = 0; i < n; i++) {
        if (!candidate[i]) continue
        const x = i % w
        const y = (i / w) | 0
        let ok = x > 0 && y > 0 && x < w - 1 && y < h - 1
        for (const j of ok ? [i - 1, i + 1, i - w, i + w] : []) {
          const d = (data[i * 4] - data[j * 4]) ** 2 + (data[i * 4 + 1] - data[j * 4 + 1]) ** 2 + (data[i * 4 + 2] - data[j * 4 + 2]) ** 2
          if (d > 24 * 24) ok = false
        }
        if (ok) {
          flat[i] = 1
          flatCount++
        }
      }
      const pool = flatCount > 50 ? flat : candidate
      const stride = Math.max(1, Math.floor((flatCount > 50 ? flatCount : total) / 20000))
      const samples: number[] = []
      let seen = 0
      for (let i = 0; i < n; i++)
        if (pool[i] && seen++ % stride === 0) samples.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
      const raw = kmeans(Float64Array.from(samples), Math.max(1, Math.min(o.colors, samples.length / 3)), mulberry32(42))
      // Asking for more colors than the image has splits one color in two; fold those back together.
      const kept: number[] = []
      for (let c = 0; c < raw.length / 3; c++) {
        const dup = kept.some(
          (j) => (raw[c * 3] - raw[j * 3]) ** 2 + (raw[c * 3 + 1] - raw[j * 3 + 1]) ** 2 + (raw[c * 3 + 2] - raw[j * 3 + 2]) ** 2 < 32 * 32,
        )
        if (!dup) kept.push(c)
      }
      const centers = Float64Array.from(kept.flatMap((c) => [raw[c * 3], raw[c * 3 + 1], raw[c * 3 + 2]]))
      const k = kept.length
      const labels = new Int8Array(n).fill(-1)
      const areas = new Array(k).fill(0)
      for (let i = 0; i < n; i++) {
        if (!candidate[i]) continue
        const c = nearest(centers, k, data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
        labels[i] = c
        areas[c]++
      }
      const mask = new Uint8Array(n)
      for (let c = 0; c < k; c++) {
        if (!areas[c]) continue
        for (let i = 0; i < n; i++) mask[i] = labels[i] === c ? 1 : 0
        // A slight grow hides the hairline gaps that smoothing opens between neighbouring colors.
        const contours = maskToContours(mask, w, h, o, 0.5)
        if (contours.length) layers.push({ color: hex(centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]), area: areas[c], contours })
      }
      layers.sort((a, b) => b.area - a.area)
    }
  }

  const points = layers.reduce((s, l) => s + l.contours.reduce((t, c) => t + c.length / 2, 0), 0)
  return { width: w, height: h, hasAlpha, layers, points }
}

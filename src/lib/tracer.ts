import type { TraceInput, TraceOptions, TraceResult } from './trace'
import type { ArtLayer } from './types'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (r: TraceResult) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./trace.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id: number; result?: TraceResult; error?: string }>) => {
    const job = pending.get(e.data.id)
    if (!job) return
    pending.delete(e.data.id)
    if (e.data.result) job.resolve(e.data.result)
    else job.reject(new Error(e.data.error ?? 'Tracing failed.'))
  }
  worker.onerror = (e) => {
    for (const job of pending.values()) job.reject(new Error(e.message || 'The tracing worker crashed.'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export function runTrace(image: TraceInput, options: TraceOptions): Promise<TraceResult> {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, image, options })
  })
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  return img.decode().then(
    () => img,
    () => {
      URL.revokeObjectURL(url)
      throw new Error('This file could not be read as an image.')
    },
  )
}

/** Draw the image so its longest side is `size` px. SVGs without a size get a square box. */
export function rasterize(img: HTMLImageElement, size: number): TraceInput {
  const w0 = img.naturalWidth || size
  const h0 = img.naturalHeight || size
  const s = size / Math.max(w0, h0)
  const w = Math.max(1, Math.round(w0 * s))
  const h = Math.max(1, Math.round(h0 * s))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  return { width: w, height: h, data }
}

export const ART_UNITS = 1000

/** Convert traced pixels to the stored form: integers centred on 0, longest side ART_UNITS. */
export function toArtLayers(result: TraceResult, oneColor: string | null): ArtLayer[] {
  const s = ART_UNITS / Math.max(result.width, result.height)
  const cx = result.width / 2
  const cy = result.height / 2
  const convert = (c: number[]) => c.map((v, i) => Math.round((v - (i % 2 === 0 ? cx : cy)) * s))
  if (oneColor) return [{ color: oneColor, contours: result.layers.flatMap((l) => l.contours.map(convert)) }]
  return result.layers.map((l) => ({ color: l.color, contours: l.contours.map(convert) }))
}

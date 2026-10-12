import { DEFAULT_FONT } from './fonts.svelte'
import { sanitizeDesign } from './sanitize'
import type { Artwork, Decoration, DecoShape, Design, OutlineLayer, Selection, TextBlock } from './types'

const STORAGE_KEY = 'kawaii-logo:design'

export const uid = () => Math.random().toString(36).slice(2, 9)

export function newBlock(partial: Partial<TextBlock> = {}): TextBlock {
  return { id: uid(), text: 'Text', fontId: DEFAULT_FONT, size: 72, tracking: 0, x: 0, y: 0, jitter: true, overrides: {}, ...partial }
}

export function newLayer(partial: Partial<OutlineLayer> = {}): OutlineLayer {
  return { id: uid(), expand: 10, color: '#ffffff', dx: 0, dy: 0, visible: true, ...partial }
}

export function defaultDesign(): Design {
  return {
    version: 1,
    blocks: [
      newBlock({ text: 'Kawaii', size: 160, tracking: -4 }),
      newBlock({ text: 'かわいい', size: 56, x: -150, y: -150, tracking: 2 }),
    ],
    fill: '#e8435f',
    pattern: { on: false, colors: ['#e8435f', '#ff9cb8'], restart: false },
    jitter: { seed: 7, mode: 'alternate', rotate: 6, lift: 8, scale: 0.04 },
    layers: [newLayer({ expand: 12, color: '#ffffff' }), newLayer({ expand: 12, color: '#e8435f', dx: 7, dy: 7 })],
    mask: {
      kind: 'wave',
      color: '#ff9cb8',
      angle: -6,
      position: 0.62,
      amplitude: 9,
      wavelength: 150,
      phase: 0,
      invert: false,
      points: [],
    },
    decorations: [],
    previewBg: 'checker',
  }
}

function loadSaved(): Design | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return sanitizeDesign(JSON.parse(raw), DEFAULT_FONT)
  } catch {
    return null
  }
}

const HISTORY_LIMIT = 100

class Editor {
  design = $state<Design>(loadSaved() ?? defaultDesign())
  selection = $state<Selection>(null)
  /** True while a pointer drag is in progress, so history records the drag as one step. */
  dragging = $state(false)
  /** Pointer input on the canvas draws the freehand two-tone mask instead of selecting. */
  drawingMask = $state(false)

  #past: string[] = []
  #future: string[] = []
  #current = JSON.stringify(this.design)
  #timer: ReturnType<typeof setTimeout> | undefined

  /** Set when the browser refuses to store the design, usually because large artwork filled the quota. */
  storageFull = $state(false)
  canUndo = $state(false)
  canRedo = $state(false)

  /** Called from an effect whenever the design changes. */
  record(): void {
    if (this.dragging) return
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      const snap = JSON.stringify(this.design)
      if (snap === this.#current) return
      this.#past.push(this.#current)
      if (this.#past.length > HISTORY_LIMIT) this.#past.shift()
      this.#future = []
      this.#current = snap
      this.#sync()
      this.#persist(snap)
    }, 250)
  }

  undo(): void {
    this.#flush()
    const prev = this.#past.pop()
    if (!prev) return
    this.#future.push(this.#current)
    this.#restore(prev)
  }

  redo(): void {
    this.#flush()
    const next = this.#future.pop()
    if (!next) return
    this.#past.push(this.#current)
    this.#restore(next)
  }

  replace(design: Design): void {
    this.selection = null
    this.design = design
  }

  #flush() {
    clearTimeout(this.#timer)
    const snap = JSON.stringify(this.design)
    if (snap !== this.#current) {
      this.#past.push(this.#current)
      this.#future = []
      this.#current = snap
    }
  }

  #restore(snap: string) {
    this.#current = snap
    this.selection = null
    this.design = JSON.parse(snap)
    this.#sync()
    this.#persist(snap)
  }

  #persist(snap: string) {
    try {
      localStorage.setItem(STORAGE_KEY, snap)
      this.storageFull = false
    } catch {
      this.storageFull = true
    }
  }

  #sync() {
    this.canUndo = this.#past.length > 0
    this.canRedo = this.#future.length > 0
  }

  block(id: string): TextBlock | undefined {
    return this.design.blocks.find((b) => b.id === id)
  }

  deco(id: string): Decoration | undefined {
    return this.design.decorations.find((d) => d.id === id)
  }

  addDecoration(shape: DecoShape, x: number, y: number, size: number): void {
    const d: Decoration = { id: uid(), shape, x, y, size, rot: 0, color: '#ffd45c' }
    this.design.decorations.push(d)
    this.selection = { kind: 'deco', id: d.id }
  }

  addArtwork(art: Artwork, color: string, x: number, y: number, size: number): void {
    const d: Decoration = { id: uid(), shape: 'art', x, y, size, rot: 0, color, art }
    this.design.decorations.push(d)
    this.selection = { kind: 'deco', id: d.id }
  }

  removeDecoration(id: string): void {
    this.design.decorations = this.design.decorations.filter((d) => d.id !== id)
    if (this.selection?.kind === 'deco' && this.selection.id === id) this.selection = null
  }
}

export const editor = new Editor()

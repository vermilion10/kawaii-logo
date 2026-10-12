import { sanitizeJitter, sanitizeLayer, sanitizeMask, sanitizePattern } from './sanitize'
import type { Design, Jitter, LetterPattern, Mask, OutlineLayer } from './types'

/** Everything about a logo's look except its text, fonts and decorations. */
export interface Style {
  id: string
  name: string
  fill: string
  /** Absent means one colour for every letter. */
  pattern?: LetterPattern
  layers: Omit<OutlineLayer, 'id'>[]
  mask: Mask
  jitter: Omit<Jitter, 'seed'>
}

const wave = (color: string, extra: Partial<Mask> = {}): Mask => ({
  kind: 'wave',
  color,
  angle: -6,
  position: 0.62,
  amplitude: 9,
  wavelength: 150,
  phase: 0,
  invert: false,
  points: [],
  ...extra,
})

const NO_MASK: Mask = { ...wave('#ffffff'), kind: 'none' }
const bounce = { mode: 'alternate', rotate: 6, lift: 8, scale: 0.04 } as const
const layer = (expand: number, color: string, dx = 0, dy = 0) => ({ expand, color, dx, dy, visible: true })

export const PRESETS: Style[] = [
  {
    id: 'classic',
    name: 'Classic',
    fill: '#e8435f',
    layers: [layer(12, '#ffffff'), layer(12, '#e8435f', 7, 7)],
    mask: wave('#ff9cb8'),
    jitter: bounce,
  },
  {
    id: 'sakura',
    name: 'Sakura',
    fill: '#ff6fa3',
    layers: [layer(12, '#ffffff'), layer(12, '#c2245f', 6, 6)],
    mask: wave('#ffc2d9', { position: 0.55, amplitude: 7, wavelength: 120 }),
    jitter: bounce,
  },
  {
    id: 'soda',
    name: 'Soda',
    fill: '#2f8cff',
    layers: [layer(12, '#ffffff'), layer(12, '#173b8f', 6, 7)],
    mask: wave('#8fd3ff', { kind: 'zigzag', amplitude: 8, wavelength: 70 }),
    jitter: bounce,
  },
  {
    id: 'melon',
    name: 'Melon',
    fill: '#3fbf63',
    layers: [layer(12, '#ffffff'), layer(12, '#1c6b37', 6, 6)],
    mask: wave('#b9ee7c', { angle: 4, position: 0.5 }),
    jitter: bounce,
  },
  {
    id: 'lemon',
    name: 'Lemon',
    fill: '#ffc21a',
    layers: [layer(12, '#ffffff'), layer(12, '#8a4b12', 6, 6)],
    mask: wave('#ff8a1a', { invert: true, position: 0.38 }),
    jitter: bounce,
  },
  {
    id: 'ink',
    name: 'Ink sticker',
    fill: '#2b2b33',
    layers: [layer(14, '#ffffff'), layer(18, '#2b2b33'), layer(18, '#2b2b33', 5, 6)],
    mask: NO_MASK,
    jitter: { mode: 'random', rotate: 5, lift: 6, scale: 0.03 },
  },
  {
    id: 'cream',
    name: 'Cream soda',
    fill: '#ffffff',
    layers: [layer(10, '#ff7aa8'), layer(20, '#ffffff'), layer(20, '#ff7aa8', 6, 6)],
    mask: wave('#ffe1ec', { position: 0.6 }),
    jitter: bounce,
  },
  {
    id: 'tangerine',
    name: 'Tangerine stripes',
    fill: '#f48120',
    pattern: { on: true, colors: ['#f48120', '#faad3f'], restart: false },
    layers: [layer(14, '#ffffff'), layer(14, '#6b6b6b', 8, 9)],
    mask: NO_MASK,
    jitter: bounce,
  },
  {
    id: 'grape',
    name: 'Grape stripes',
    fill: '#7a4691',
    pattern: { on: true, colors: ['#7a4691', '#7d7aa3'], restart: false },
    layers: [layer(12, '#ffffff'), layer(12, '#2a2230', 4, 5)],
    mask: NO_MASK,
    jitter: { mode: 'alternate', rotate: 5, lift: 6, scale: 0.03 },
  },
  {
    id: 'flat',
    name: 'Flat',
    fill: '#e8435f',
    layers: [layer(10, '#ffffff')],
    mask: NO_MASK,
    jitter: { mode: 'alternate', rotate: 3, lift: 4, scale: 0 },
  },
]

const uid = () => Math.random().toString(36).slice(2, 9)

/** Apply a style in place, keeping the text, fonts, letter edits, decorations and bounce seed. */
export function applyStyle(design: Design, style: Style): void {
  design.fill = style.fill
  design.pattern = style.pattern
    ? { ...style.pattern, colors: [...style.pattern.colors] }
    : { ...design.pattern, on: false }
  design.layers = style.layers.map((l) => ({ ...l, id: uid() }))
  // A preset with no freehand shape keeps the one the user drew, in case they switch back.
  design.mask = { ...style.mask, points: style.mask.points.length ? [...style.mask.points] : design.mask.points }
  design.jitter = { ...style.jitter, seed: design.jitter.seed }
}

export function captureStyle(design: Design, name: string): Style {
  return {
    id: 'mine:' + uid(),
    name,
    fill: design.fill,
    pattern: design.pattern.on ? { ...design.pattern, colors: [...design.pattern.colors] } : undefined,
    layers: design.layers.map(({ id: _, ...l }) => ({ ...l })),
    mask: { ...design.mask, points: design.mask.points.map((p) => [...p] as [number, number]) },
    jitter: { mode: design.jitter.mode, rotate: design.jitter.rotate, lift: design.jitter.lift, scale: design.jitter.scale },
  }
}

const SAVED_KEY = 'kawaii-logo:styles'

export function loadSavedStyles(): Style[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.slice(0, 50).map((s) => {
      const fill = typeof s?.fill === 'string' && /^#[0-9a-f]{6}$/i.test(s.fill) ? s.fill : '#e8435f'
      const { seed: _, ...jitter } = sanitizeJitter(s?.jitter)
      return {
        id: typeof s?.id === 'string' ? s.id.slice(0, 40) : 'mine:' + uid(),
        name: typeof s?.name === 'string' ? s.name.slice(0, 40) : 'My style',
        fill,
        pattern: s?.pattern ? sanitizePattern(s.pattern, fill) : undefined,
        layers: Array.isArray(s?.layers) ? s.layers.slice(0, 20).map((l: unknown) => {
          const { id: __, ...rest } = sanitizeLayer(l)
          return rest
        }) : [],
        mask: sanitizeMask(s?.mask),
        jitter,
      }
    })
  } catch {
    return []
  }
}

/** Returns false when the browser refuses to store the list. */
export function storeSavedStyles(styles: Style[]): boolean {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(styles))
    return true
  } catch {
    return false
  }
}

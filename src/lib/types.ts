export type Pt = { X: number; Y: number }
export type Polys = Pt[][]

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface LetterOverride {
  dx: number
  dy: number
  rot: number
  scale: number
  /** A colour picked for this letter alone; wins over the pattern and the main fill. */
  color?: string
}

/** Letters cycle through `colors` in reading order when `on`. */
export interface LetterPattern {
  on: boolean
  colors: string[]
  /** Start the cycle again at the first colour on every line. */
  restart: boolean
}

export interface TextBlock {
  id: string
  text: string
  fontId: string
  size: number
  tracking: number
  x: number
  y: number
  jitter: boolean
  overrides: Record<number, LetterOverride>
}

export type JitterMode = 'random' | 'alternate'

export interface Jitter {
  seed: number
  mode: JitterMode
  rotate: number
  lift: number
  scale: number
}

export interface OutlineLayer {
  id: string
  expand: number
  color: string
  dx: number
  dy: number
  visible: boolean
}

export type MaskKind = 'none' | 'wave' | 'zigzag' | 'straight' | 'freehand'

export interface Mask {
  kind: MaskKind
  color: string
  angle: number
  position: number
  amplitude: number
  wavelength: number
  phase: number
  invert: boolean
  points: [number, number][]
}

export type DecoShape = 'heart' | 'star' | 'sparkle' | 'dot' | 'flower'

export interface ArtLayer {
  color: string
  /** Flat [x0, y0, ...] integers centred on 0, with the longest side 1000 units. */
  contours: number[][]
}

export interface Artwork {
  name: string
  layers: ArtLayer[]
  /** Paint every layer in the decoration's `color` instead of its traced color. */
  oneColor: boolean
}

export interface Decoration {
  id: string
  shape: DecoShape | 'art'
  x: number
  y: number
  /** Longest side in px. */
  size: number
  rot: number
  color: string
  art?: Artwork
}

export type PreviewBg = 'checker' | 'light' | 'dark'

export interface Design {
  version: 1
  blocks: TextBlock[]
  fill: string
  pattern: LetterPattern
  jitter: Jitter
  layers: OutlineLayer[]
  mask: Mask
  decorations: Decoration[]
  previewBg: PreviewBg
}

export type Selection =
  | { kind: 'letter'; blockId: string; index: number }
  | { kind: 'deco'; id: string }
  | null

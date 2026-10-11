import { parse, type Font } from 'opentype.js'

export interface FontEntry {
  id: string
  name: string
  url?: string
  note: string
  user?: boolean
}

export const DEFAULT_FONT = 'mochiy-pop-p-one'

export const BUNDLED_FONTS: FontEntry[] = [
  { id: DEFAULT_FONT, name: 'Mochiy Pop P One', url: '/fonts/MochiyPopPOne-Regular.ttf', note: 'Bubbly, closest to Yuruka. Latin + Japanese.' },
  { id: 'mochiy-pop-one', name: 'Mochiy Pop One', url: '/fonts/MochiyPopOne-Regular.ttf', note: 'Monospaced Latin version of Mochiy Pop.' },
  { id: 'm-plus-rounded-1c', name: 'M PLUS Rounded 1c ExtraBold', url: '/fonts/MPLUSRounded1c-ExtraBold.ttf', note: 'Clean rounded gothic.' },
  { id: 'zen-maru-gothic', name: 'Zen Maru Gothic Black', url: '/fonts/ZenMaruGothic-Black.ttf', note: 'Heavy, soft rounded gothic.' },
  { id: 'hachi-maru-pop', name: 'Hachi Maru Pop', url: '/fonts/HachiMaruPop-Regular.ttf', note: 'Handwritten, very cute.' },
  { id: 'kiwi-maru', name: 'Kiwi Maru Medium', url: '/fonts/KiwiMaru-Medium.ttf', note: 'Gentle rounded mincho.' },
  { id: 'dela-gothic-one', name: 'Dela Gothic One', url: '/fonts/DelaGothicOne-Regular.ttf', note: 'Chunky display gothic.' },
]

type Status = 'loading' | 'ready' | 'error'

class FontStore {
  userFonts = $state<FontEntry[]>([])
  status = $state<Record<string, Status>>({})
  // Parsed fonts are large object graphs, so they must not be made deeply reactive.
  loaded = $state.raw<Record<string, Font>>({})

  get all(): FontEntry[] {
    return [...BUNDLED_FONTS, ...this.userFonts]
  }

  entry(id: string): FontEntry | undefined {
    return this.all.find((f) => f.id === id)
  }

  async ensure(id: string): Promise<void> {
    if (this.loaded[id] || this.status[id] === 'loading') return
    const entry = this.entry(id)
    if (!entry?.url) return
    this.status[id] = 'loading'
    try {
      const res = await fetch(entry.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const font = parse(await res.arrayBuffer())
      this.loaded = { ...this.loaded, [id]: font }
      this.status[id] = 'ready'
    } catch (err) {
      console.error(`Font ${id} failed to load`, err)
      this.status[id] = 'error'
    }
  }

  /** Parse a font file from the user's disk. It is stored in this browser only. */
  async addUserFont(file: File): Promise<FontEntry> {
    const data = await file.arrayBuffer()
    const font = parse(data)
    const family = font.getEnglishName('fontFamily') || file.name.replace(/\.[^.]+$/, '')
    const sub = font.getEnglishName('fontSubfamily') || ''
    const name = sub && sub !== 'Regular' ? `${family} ${sub}` : family
    const id = 'user:' + name
    const entry: FontEntry = { id, name, note: 'Your font, stored in this browser only.', user: true }
    this.loaded = { ...this.loaded, [id]: font }
    this.status[id] = 'ready'
    if (!this.userFonts.some((f) => f.id === id)) this.userFonts.push(entry)
    await idbPut({ id, name, data }).catch((err) => console.warn('Could not keep the font for next visit', err))
    return entry
  }

  async removeUserFont(id: string): Promise<void> {
    this.userFonts = this.userFonts.filter((f) => f.id !== id)
    const { [id]: _, ...rest } = this.loaded
    this.loaded = rest
    delete this.status[id]
    await idbDelete(id).catch(() => {})
  }

  async restoreUserFonts(): Promise<void> {
    let rows: StoredFont[] = []
    try {
      rows = await idbAll()
    } catch {
      return
    }
    const loaded = { ...this.loaded }
    for (const row of rows) {
      try {
        loaded[row.id] = parse(row.data)
        this.status[row.id] = 'ready'
        if (!this.userFonts.some((f) => f.id === row.id))
          this.userFonts.push({ id: row.id, name: row.name, note: 'Your font, stored in this browser only.', user: true })
      } catch (err) {
        console.warn(`Stored font ${row.name} could not be parsed`, err)
      }
    }
    this.loaded = loaded
  }
}

export const fonts = new FontStore()

interface StoredFont {
  id: string
  name: string
  data: ArrayBuffer
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kawaii-logo', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('fonts', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction('fonts', mode).objectStore('fonts'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const idbPut = (row: StoredFont) => withStore('readwrite', (s) => s.put(row))
const idbDelete = (id: string) => withStore('readwrite', (s) => s.delete(id))
const idbAll = () => withStore<StoredFont[]>('readonly', (s) => s.getAll())

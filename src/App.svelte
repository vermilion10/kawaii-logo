<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { editor } from './lib/store.svelte'
  import { DEFAULT_FONT, fonts } from './lib/fonts.svelte'
  import { buildScene } from './lib/scene'
  import Title from './components/Title.svelte'
  import Canvas from './components/Canvas.svelte'
  import TextPanel from './components/TextPanel.svelte'
  import LettersPanel from './components/LettersPanel.svelte'
  import ColorsPanel from './components/ColorsPanel.svelte'
  import TwoTonePanel from './components/TwoTonePanel.svelte'
  import DecorPanel from './components/DecorPanel.svelte'
  import ExportPanel from './components/ExportPanel.svelte'
  import TraceDialog from './components/TraceDialog.svelte'
  import StylesPanel from './components/StylesPanel.svelte'
  import { clearHash, designFromHash } from './lib/share'
  import type { Artwork } from './lib/types'

  const TABS = [
    { id: 'styles', label: 'Styles' },
    { id: 'text', label: 'Text' },
    { id: 'letters', label: 'Letters' },
    { id: 'colors', label: 'Outlines' },
    { id: 'twotone', label: 'Two-tone' },
    { id: 'decor', label: 'Decor' },
    { id: 'export', label: 'Export' },
  ] as const
  type TabId = (typeof TABS)[number]['id']

  function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    try {
      const v = localStorage.getItem(key) as T | null
      return v && allowed.includes(v) ? v : fallback
    } catch {
      return fallback
    }
  }
  function writePref(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Preferences are a convenience; ignore blocked storage.
    }
  }

  let tab = $state<TabId>(readPref('kawaii-logo:tab', TABS.map((t) => t.id), 'text'))
  $effect(() => writePref('kawaii-logo:tab', tab))

  type Theme = 'system' | 'light' | 'dark'
  let theme = $state<Theme>(readPref('kawaii-logo:theme', ['light', 'dark'], 'system'))
  function cycleTheme() {
    theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    writePref('kawaii-logo:theme', theme)
  }

  const scene = $derived(buildScene(editor.design, fonts.loaded, DEFAULT_FONT))

  // Reads every field so any edit schedules a history entry. Traced contours are skipped:
  // they never change in place, and walking thousands of points on every edit is slow.
  function touch(v: unknown): void {
    if (Array.isArray(v)) for (const x of v) touch(x)
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'contours') touch(x)
  }

  $effect(() => {
    touch(editor.design)
    editor.record()
  })

  $effect(() => {
    fonts.ensure(DEFAULT_FONT)
    for (const b of editor.design.blocks) fonts.ensure(b.fontId)
  })

  onMount(() => {
    fonts.restoreUserFonts()
    openSharedLink()
    window.addEventListener('hashchange', openSharedLink)
    return () => window.removeEventListener('hashchange', openSharedLink)
  })

  async function openSharedLink() {
    const shared = await designFromHash(DEFAULT_FONT)
    if (!shared) return
    clearHash()
    if (shared === 'invalid') {
      say('That share link is damaged or incomplete, so your own design was kept.', 'error')
      return
    }
    editor.replace(shared)
    say('Opened a shared design. Ctrl+Z brings back the one you had before.')
  }

  let toast = $state<{ text: string; tone: 'info' | 'error' } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  function say(text: string, tone: 'info' | 'error' = 'info') {
    toast = { text, tone }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast = null), tone === 'error' ? 8000 : 4000)
  }

  const notice = $derived.by((): { tone: 'info' | 'error'; text: string } | null => {
    const status = fonts.status[DEFAULT_FONT]
    if (status === 'error') return { tone: 'error', text: 'The default font could not be downloaded. Reload the page to try again.' }
    if (!fonts.loaded[DEFAULT_FONT]) return { tone: 'info', text: 'Loading the default font (about 5 MB, first visit only)…' }
    if (!scene.fillD && scene.decos.length === 0) return { tone: 'info', text: 'Type something in the Text tab to start.' }
    if (editor.storageFull)
      return {
        tone: 'error',
        text: 'This design is too large to keep in the browser. Use Save project in the Export tab so you do not lose it.',
      }
    if (scene.missingGlyphs.length)
      return {
        tone: 'info',
        text: `No font here has these characters, so they are skipped: ${scene.missingGlyphs.join(' ')}`,
      }
    return null
  })

  const FONT_EXT = /\.(ttf|otf|woff)$/i

  async function useFontFile(file: File, blockId: string) {
    if (/\.woff2$/i.test(file.name)) {
      say('WOFF2 is not supported yet. Use the .ttf, .otf or .woff version of the font.', 'error')
      return
    }
    try {
      const entry = await fonts.addUserFont(file)
      const block = editor.block(blockId)
      if (block) block.fontId = entry.id
      say(`Using ${entry.name}. It stays in this browser only.`)
    } catch (err) {
      say(`Could not read ${file.name}: ${(err as Error).message}`, 'error')
    }
  }

  let traceFile = $state<File | null>(null)

  function addArtwork(art: Artwork, color: string) {
    // Traced art lands to the right of the lettering, about as tall as the main line.
    const b = scene.textBox ?? { x: -100, y: -100, w: 200, h: 100 }
    const size = Math.round(Math.max(60, b.h * 0.9))
    editor.addArtwork(art, color, Math.round(b.x + b.w + size * 0.4), Math.round(b.y + b.h / 2), size)
    tab = 'decor'
    say(`Added “${art.name}”. Drag it into place on the canvas.`)
  }

  let dropping = $state(false)
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    dropping = true
  }
  function onDrop(e: DragEvent) {
    dropping = false
    const file = e.dataTransfer?.files[0]
    if (!file) return
    e.preventDefault()
    if (FONT_EXT.test(file.name) || /\.woff2$/i.test(file.name)) {
      const s = editor.selection
      const target = s?.kind === 'letter' ? s.blockId : editor.design.blocks[0].id
      useFontFile(file, target)
    } else if (file.type.startsWith('image/') || /\.svg$/i.test(file.name)) {
      traceFile = file
    } else {
      say(`${file.name} is not a font or an image this app can read.`, 'error')
    }
  }

  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement
    const typing = el.closest('input[type=text], input[type=number], textarea, select')
    if (typing || !(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault()
      editor.undo()
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault()
      editor.redo()
    }
  }

  function onTabKey(e: KeyboardEvent, i: number) {
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    tab = TABS[next].id
    document.getElementById(`tab-${tab}`)?.focus()
  }

  $effect(() => {
    // Selecting something on the canvas opens the tab that edits it.
    const s = editor.selection
    untrack(() => {
      if (s?.kind === 'deco' && tab !== 'decor') tab = 'decor'
      else if (s?.kind === 'letter' && tab !== 'letters' && tab !== 'text') tab = 'letters'
    })
  })
</script>

<svelte:window onkeydown={onKey} ondragover={onDragOver} ondragleave={() => (dropping = false)} ondrop={onDrop} />

<div class="app" class:dropping>
  <header>
    <Title />
    <div class="actions">
      <button class="btn small" type="button" disabled={!editor.canUndo} onclick={() => editor.undo()} title="Ctrl+Z">Undo</button>
      <button class="btn small" type="button" disabled={!editor.canRedo} onclick={() => editor.redo()} title="Ctrl+Y">Redo</button>
      <button class="btn small" type="button" onclick={cycleTheme} aria-label="Theme: {theme}. Click to change.">
        Theme: {theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}
      </button>
    </div>
  </header>

  <main>
    <div class="canvas-area">
      <Canvas {scene} {notice} />
    </div>

    <aside class="panel" aria-label="Logo settings">
      <div class="tabs" role="tablist" aria-label="Settings">
        {#each TABS as t, i (t.id)}
          <button
            id="tab-{t.id}"
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls="panel-{t.id}"
            tabindex={tab === t.id ? 0 : -1}
            onclick={() => (tab = t.id)}
            onkeydown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        {/each}
      </div>
      <div class="tab-body" id="panel-{tab}" role="tabpanel" aria-labelledby="tab-{tab}" tabindex="-1">
        {#if tab === 'styles'}
          <StylesPanel {say} />
        {:else if tab === 'text'}
          <TextPanel onFontFile={useFontFile} />
        {:else if tab === 'letters'}
          <LettersPanel />
        {:else if tab === 'colors'}
          <ColorsPanel />
        {:else if tab === 'twotone'}
          <TwoTonePanel />
        {:else if tab === 'decor'}
          <DecorPanel textBox={scene.textBox} ontrace={(f) => (traceFile = f)} />
        {:else}
          <ExportPanel {scene} {say} />
        {/if}
      </div>
    </aside>
  </main>

  <TraceDialog
    file={traceFile}
    defaultColor={editor.design.fill}
    onclose={() => (traceFile = null)}
    onadd={addArtwork}
  />

  <div class="toast-region" aria-live="polite">
    {#if toast}
      <p class="toast" class:error={toast.tone === 'error'}>{toast.text}</p>
    {/if}
  </div>

  <footer>
    <p class="links">
      <a href="https://github.com/vermilion10/kawaii-logo" target="_blank" rel="noreferrer">Source code on GitHub</a>
      <a href="https://github.com/vermilion10/kawaii-logo/issues" target="_blank" rel="noreferrer">Request a feature or report a bug</a>
    </p>
    <p>
      Runs entirely in your browser; nothing is uploaded. Built-in fonts are licensed under the
      <a href="https://openfontlicense.org" target="_blank" rel="noreferrer">SIL Open Font License</a>.
    </p>
  </footer>
</div>

<style>
  .app {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr auto;
  }
  .app.dropping {
    outline: 4px dashed var(--accent);
    outline-offset: -8px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 12px 20px 4px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: 16px;
    padding: 12px 20px;
    height: calc(100dvh - 120px);
    min-height: 520px;
  }
  .canvas-area {
    min-width: 0;
    min-height: 0;
  }
  .panel {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
    min-width: 0;
    background: var(--surface);
    border: 2px solid var(--line);
    border-radius: var(--r-lg);
    overflow: hidden;
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
    padding: 6px;
    border-bottom: 2px solid var(--line);
    background: var(--surface-2);
  }
  .tabs button {
    min-height: 40px;
    padding: 4px 7px;
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    font-weight: 700;
    font-size: 14px;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tabs button:hover {
    color: var(--ink);
  }
  .tabs button[aria-selected='true'] {
    background: var(--surface);
    color: var(--accent);
    box-shadow: inset 0 -3px 0 var(--accent);
  }
  .tab-body {
    overflow-y: auto;
    padding: 16px 18px 24px;
    outline: none;
  }
  .toast-region {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 32px));
    z-index: 10;
    pointer-events: none;
  }
  .toast {
    margin: 0;
    padding: 10px 14px;
    border-radius: var(--r-md);
    background: var(--ink);
    color: var(--bg);
    font-weight: 700;
    box-shadow: 4px 4px 0 var(--accent);
  }
  .toast.error {
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: 4px 4px 0 var(--hard-shadow);
  }
  footer {
    display: grid;
    gap: 4px;
    padding: 4px 20px 16px;
  }
  footer .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    font-weight: 700;
  }
  footer .links a {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
  }
  footer p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-soft);
  }
  footer a {
    color: inherit;
  }

  @media (max-width: 900px) {
    main {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
      min-height: 0;
      padding: 8px 16px;
    }
    .canvas-area {
      height: 46vh;
      min-height: 260px;
    }
    .panel {
      overflow: visible;
    }
    .tab-body {
      overflow: visible;
    }
    header {
      padding: 10px 16px 0;
    }
    footer {
      padding: 4px 16px 16px;
    }
  }

  /* On tall phones the canvas stays pinned so changes are visible while scrolling the settings. */
  @media (max-width: 900px) and (min-height: 560px) {
    .canvas-area {
      position: sticky;
      top: 0;
      z-index: 5;
      height: calc(40svh + 16px);
      min-height: 0;
      margin: -8px 0;
      padding: 8px 0;
      background: var(--bg);
    }
    /* Keeps a focused field from being scrolled in behind the pinned canvas. */
    :global(html) {
      scroll-padding-top: calc(40svh + 32px);
    }
  }

  @media (max-width: 520px) {
    .tabs button {
      min-height: 44px;
    }
  }
</style>

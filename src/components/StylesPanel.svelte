<script lang="ts">
  import { untrack } from 'svelte'
  import { editor } from '../lib/store.svelte'
  import { DEFAULT_FONT, fonts } from '../lib/fonts.svelte'
  import { buildScene } from '../lib/scene'
  import { PRESETS, applyStyle, captureStyle, loadSavedStyles, storeSavedStyles, type Style } from '../lib/presets'
  import type { Design } from '../lib/types'

  let { say }: { say: (text: string, tone?: 'info' | 'error') => void } = $props()

  let saved = $state<Style[]>(loadSavedStyles())
  let newName = $state('')

  // Previews use only the main line so they stay quick and readable at thumbnail size.
  const main = $derived(editor.design.blocks[0])
  const previewKey = $derived(main ? `${main.text}|${main.fontId}|${main.tracking}` : '')

  function preview(style: Style, key: string) {
    if (!key || !main) return null
    const d: Design = {
      version: 1,
      blocks: [{ ...$state.snapshot(main), x: 0, y: 0, size: 120, overrides: {} }],
      fill: '',
      pattern: { ...editor.design.pattern, colors: [...editor.design.pattern.colors] },
      jitter: { ...editor.design.jitter },
      layers: [],
      mask: { ...editor.design.mask },
      decorations: [],
      previewBg: 'checker',
    }
    applyStyle(d, style)
    if (!fonts.loaded[d.blocks[0].fontId] && !fonts.loaded[DEFAULT_FONT]) return null
    const scene = buildScene(d, fonts.loaded, DEFAULT_FONT)
    return scene.fillD ? scene : null
  }

  const all = $derived([...PRESETS, ...saved])
  const previews = $derived.by(() => {
    const key = previewKey
    const list = all
    void fonts.loaded
    return untrack(() => new Map(list.map((s) => [s.id, preview(s, key)])))
  })

  function use(style: Style) {
    applyStyle(editor.design, style)
    say(`Applied ${style.name}. Ctrl+Z undoes it.`)
  }

  function save() {
    const name = newName.trim() || `My style ${saved.length + 1}`
    const next = [...saved, captureStyle($state.snapshot(editor.design) as Design, name)]
    if (!storeSavedStyles(next)) {
      say('The browser would not store the style. Storage may be full or blocked.', 'error')
      return
    }
    saved = next
    newName = ''
    say(`Saved ${name}.`)
  }

  function remove(id: string) {
    const next = saved.filter((s) => s.id !== id)
    if (storeSavedStyles(next)) saved = next
  }
</script>

<div class="stack">
  <section>
    <h3>Styles</h3>
    <p class="hint">A style sets the colors, outline layers, two-tone and bounce. Your text, fonts and decorations stay.</p>
    {#if !previewKey}
      <p class="hint">Type some text in the Text tab to see the styles on it.</p>
    {/if}
    <ul class="grid">
      {#each all as style (style.id)}
        {@const scene = previews.get(style.id)}
        <li>
          <button class="card" type="button" onclick={() => use(style)}>
            <span class="thumb">
              {#if scene}
                <svg viewBox="{scene.viewBox.x} {scene.viewBox.y} {scene.viewBox.w} {scene.viewBox.h}" aria-hidden="true">
                  {#each scene.layers as l (l.id)}<path d={l.d} fill={l.color} />{/each}
                  {#each scene.fills as f, i (i)}<path d={f.d} fill={f.color} />{/each}
                  {#if scene.maskD}<path d={scene.maskD} fill={scene.maskColor} />{/if}
                </svg>
              {:else}
                <span class="swatches" aria-hidden="true">
                  <i style:background={style.fill}></i>
                  {#each style.layers as l, i (i)}<i style:background={l.color}></i>{/each}
                </span>
              {/if}
            </span>
            <span class="name">{style.name}</span>
          </button>
          {#if style.id.startsWith('mine:')}
            <button class="btn small" type="button" onclick={() => remove(style.id)} aria-label="Delete style {style.name}">
              Delete
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section>
    <h3>Save the current style</h3>
    <p class="hint">Saved styles live in this browser and show up in the list above.</p>
    <div class="save">
      <label class="visually-hidden" for="style-name">Style name</label>
      <input id="style-name" type="text" placeholder="Style name" maxlength="40" bind:value={newName} onkeydown={(e) => e.key === 'Enter' && save()} />
      <button class="btn" type="button" onclick={save}>Save style</button>
    </div>
  </section>
</div>

<style>
  .stack {
    display: grid;
    gap: 22px;
  }
  section {
    display: grid;
    gap: 10px;
  }
  h3 {
    font-size: 17px;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  li {
    display: grid;
    gap: 4px;
  }
  .card {
    display: grid;
    gap: 4px;
    padding: 6px;
    border: 2px solid var(--line);
    border-radius: var(--r-md);
    background: var(--surface);
    cursor: pointer;
    text-align: left;
  }
  .card:hover {
    border-color: var(--accent);
  }
  .thumb {
    display: grid;
    place-items: center;
    height: 72px;
    border-radius: var(--r-sm);
    background: repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%) 0 0 / 12px 12px;
    overflow: hidden;
  }
  .thumb svg {
    width: 100%;
    height: 100%;
  }
  .swatches {
    display: flex;
    gap: 4px;
  }
  .swatches i {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--line);
  }
  .name {
    font-weight: 700;
    font-size: 14px;
    padding: 0 2px;
  }
  .save {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }
</style>

<script lang="ts">
  import { editor } from '../lib/store.svelte'
  import { SHAPE_LABELS, shapeIcon } from '../lib/shapes'
  import type { Box, DecoShape } from '../lib/types'
  import ColorField from './ColorField.svelte'
  import Range from './Range.svelte'

  let { textBox, ontrace }: { textBox: Box | null; ontrace: (file: File) => void } = $props()

  function pickImage(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) ontrace(file)
  }

  const SHAPES = Object.keys(SHAPE_LABELS) as DecoShape[]

  function add(shape: DecoShape) {
    // New pieces land at the top-right corner of the lettering, where they usually end up anyway.
    const b = textBox ?? { x: -100, y: -100, w: 200, h: 100 }
    const n = editor.design.decorations.length
    editor.addDecoration(shape, Math.round(b.x + b.w + 10 - n * 24), Math.round(b.y - 10 + n * 18), Math.round(Math.max(40, b.h * 0.4)))
  }

  const current = $derived.by(() => {
    const s = editor.selection
    return s?.kind === 'deco' ? editor.deco(s.id) : undefined
  })
</script>

<div class="stack">
  <section>
    <h3>Add a decoration</h3>
    <p class="hint">Decorations get the same outlines as the letters, so they merge into the logo.</p>
    <div class="shapes">
      {#each SHAPES as shape (shape)}
        <button class="btn shape" type="button" onclick={() => add(shape)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={shapeIcon(shape)} /></svg>
          {SHAPE_LABELS[shape]}
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h3>Selected decoration</h3>
    {#if current}
      {#if current.art}
        <p class="hint">Traced from “{current.art.name}”.</p>
        <label class="check">
          <input type="checkbox" bind:checked={current.art.oneColor} />
          Paint it in one color{current.art.layers.length > 1 ? ' (off keeps the traced colors)' : ''}
        </label>
      {/if}
      {#if !current.art || current.art.oneColor}
        <ColorField label="Color" bind:value={current.color} />
      {/if}
      <Range label="Size" bind:value={current.size} min={8} max={800} unit="px" />
      <Range label="Rotation" bind:value={current.rot} min={-180} max={180} unit="°" />
      <div class="row">
        {#if !current.art || current.art.oneColor}
          <button class="btn small" type="button" onclick={() => (current.color = editor.design.fill)}>Match letter color</button>
        {/if}
        <button class="btn small" type="button" onclick={() => editor.removeDecoration(current.id)}>Delete</button>
      </div>
      <p class="hint">Drag it on the canvas. The round handle rotates, the square one resizes.</p>
    {:else if editor.design.decorations.length}
      <p class="hint">Click a decoration on the canvas to change it.</p>
    {:else}
      <p class="hint">Nothing added yet. Pick a shape above and it appears next to the text.</p>
    {/if}
  </section>

  <section>
    <h3>Your own artwork</h3>
    <p class="hint">
      Turn a PNG, JPG, WebP or SVG into vector shapes, for example an icon or a mascot silhouette. You can also drop
      an image anywhere on the page. Images are processed in your browser and never uploaded.
    </p>
    <label class="btn primary file">
      Trace an image
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg" onchange={pickImage} />
    </label>
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
  .shapes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .shape svg {
    fill: var(--accent);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .file {
    justify-self: start;
    position: relative;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .file:focus-within {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>

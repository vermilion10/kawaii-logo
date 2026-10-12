<script lang="ts">
  import { editor, newLayer } from '../lib/store.svelte'
  import type { PreviewBg } from '../lib/types'
  import ColorField from './ColorField.svelte'
  import Range from './Range.svelte'

  const design = $derived(editor.design)

  function move(i: number, by: number) {
    const j = i + by
    const list = design.layers
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
  }

  function addLayer() {
    const last = design.layers[design.layers.length - 1]
    design.layers.push(newLayer({ expand: (last?.expand ?? 0) + 6, color: '#3b2230' }))
  }

  const pattern = $derived(design.pattern)
  const picked = $derived(design.blocks.reduce((n, b) => n + Object.values(b.overrides).filter((o) => o.color).length, 0))

  function setMode(on: boolean) {
    // Turning the pattern on starts from the current fill so the first letters keep their colour.
    if (on && !pattern.on) pattern.colors[0] = design.fill
    pattern.on = on
  }

  function clearPicked() {
    for (const b of design.blocks) for (const o of Object.values(b.overrides)) delete o.color
  }

  const BGS: { value: PreviewBg; label: string }[] = [
    { value: 'checker', label: 'Transparent' },
    { value: 'light', label: 'White' },
    { value: 'dark', label: 'Dark' },
  ]
</script>

<div class="stack">
  <section>
    <h3>Letter color</h3>
    <div class="seg" role="radiogroup" aria-label="Letter coloring">
      <label class:on={!pattern.on}>
        <input type="radio" name="lettermode" checked={!pattern.on} onchange={() => setMode(false)} /> One color
      </label>
      <label class:on={pattern.on}>
        <input type="radio" name="lettermode" checked={pattern.on} onchange={() => setMode(true)} /> Pattern
      </label>
    </div>
    {#if pattern.on}
      <p class="hint">Letters take these colors in turn, like stripes.</p>
      {#each pattern.colors as _, i (i)}
        <div class="pattern-row">
          <ColorField label="Color {i + 1}" bind:value={pattern.colors[i]} />
          <button
            class="btn small"
            type="button"
            disabled={pattern.colors.length <= 2}
            onclick={() => pattern.colors.splice(i, 1)}
            aria-label="Remove color {i + 1}">Remove</button
          >
        </div>
      {/each}
      <button
        class="btn small"
        type="button"
        disabled={pattern.colors.length >= 6}
        onclick={() => pattern.colors.push(pattern.colors[pattern.colors.length - 2] ?? design.fill)}>Add a color</button
      >
      <label class="check"><input type="checkbox" bind:checked={pattern.restart} /> Start over on each line</label>
    {:else}
      <ColorField label="Fill" bind:value={design.fill} />
    {/if}
    <p class="hint">To color a single letter, select it on the canvas and pick its color in the Letters tab.</p>
    {#if picked}
      <button class="btn small" type="button" onclick={clearPicked}>
        Clear {picked} picked letter {picked === 1 ? 'color' : 'colors'}
      </button>
    {/if}
  </section>

  <section>
    <h3>Outline layers</h3>
    <p class="hint">
      Each layer is the whole logo grown outward. The first one sits right under the letters; shift a layer to turn it
      into a shadow.
    </p>
    {#each design.layers as layer, i (layer.id)}
      <fieldset class="layer" class:hidden={!layer.visible}>
        <legend>Layer {i + 1}</legend>
        <div class="tools">
          <label class="check"><input type="checkbox" bind:checked={layer.visible} /> Show</label>
          <button class="btn small" type="button" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Move layer {i + 1} closer to the letters">Closer</button>
          <button class="btn small" type="button" disabled={i === design.layers.length - 1} onclick={() => move(i, 1)} aria-label="Move layer {i + 1} further back">Further</button>
          <button class="btn small" type="button" onclick={() => design.layers.splice(i, 1)} aria-label="Delete layer {i + 1}">Delete</button>
        </div>
        <ColorField label="Color" bind:value={layer.color} />
        <Range label="Thickness" bind:value={layer.expand} min={0} max={80} unit="px" />
        <div class="pair">
          <Range label="Shift X" bind:value={layer.dx} min={-40} max={40} unit="px" />
          <Range label="Shift Y" bind:value={layer.dy} min={-40} max={40} unit="px" />
        </div>
      </fieldset>
    {:else}
      <p class="hint">No outline layers. The letters are exported flat.</p>
    {/each}
    <button class="btn" type="button" onclick={addLayer}>Add outline layer</button>
  </section>

  <section>
    <h3>Canvas preview</h3>
    <p class="hint">Only changes the editor background. PNG exports stay transparent.</p>
    <div class="seg" role="radiogroup" aria-label="Canvas background">
      {#each BGS as bg (bg.value)}
        <label class:on={design.previewBg === bg.value}>
          <input type="radio" name="previewbg" value={bg.value} bind:group={design.previewBg} />
          {bg.label}
        </label>
      {/each}
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
  section > .btn {
    justify-self: start;
  }
  h3 {
    font-size: 17px;
  }
  .pattern-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 8px;
  }
  section > .btn.small {
    justify-self: start;
  }
  .layer {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 10px 12px 14px;
    border: 2px solid var(--line);
    border-radius: var(--r-md);
  }
  .layer.hidden {
    border-style: dashed;
  }
  legend {
    font-weight: 800;
    padding: 0 6px;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: auto;
    font-size: 14px;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 420px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>

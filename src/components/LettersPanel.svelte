<script lang="ts">
  import { editor } from '../lib/store.svelte'
  import { NO_OVERRIDE } from '../lib/scene'
  import Range from './Range.svelte'

  const jitter = $derived(editor.design.jitter)

  const target = $derived.by(() => {
    const s = editor.selection
    if (s?.kind !== 'letter') return null
    const block = editor.block(s.blockId)
    if (!block) return null
    return { block, index: s.index, char: Array.from(block.text)[s.index] ?? '' }
  })

  function edit() {
    if (!target) return null
    target.block.overrides[target.index] ??= { ...NO_OVERRIDE }
    return target.block.overrides[target.index]
  }

  const ov = $derived(target ? (target.block.overrides[target.index] ?? NO_OVERRIDE) : NO_OVERRIDE)

  function set(key: 'dx' | 'dy' | 'rot' | 'scale', v: number) {
    const o = edit()
    if (o) o[key] = v
  }

  function resetLetter() {
    if (target) delete target.block.overrides[target.index]
  }

  function resetAll() {
    for (const b of editor.design.blocks) b.overrides = {}
  }

  const hasOverrides = $derived(editor.design.blocks.some((b) => Object.keys(b.overrides).length > 0))
</script>

<div class="stack">
  <section>
    <h3>Bounce</h3>
    <p class="hint">Small random tilts and lifts give the letters a floating look. Keep it subtle.</p>
    <fieldset class="modes">
      <legend class="field-label">Pattern</legend>
      <label><input type="radio" name="jmode" value="alternate" bind:group={jitter.mode} /> Up and down</label>
      <label><input type="radio" name="jmode" value="random" bind:group={jitter.mode} /> Random</label>
    </fieldset>
    <Range label="Tilt" bind:value={jitter.rotate} min={0} max={25} step={0.5} unit="°" />
    <Range label="Lift" bind:value={jitter.lift} min={0} max={40} unit="px" />
    <Range label="Size wobble" bind:value={jitter.scale} min={0} max={0.25} step={0.01} />
    <button class="btn primary" type="button" onclick={() => (jitter.seed = Math.floor(Math.random() * 1e6))}>
      Shuffle letters
    </button>
  </section>

  <section>
    <h3>Selected letter</h3>
    {#if target}
      <p class="hint">
        Editing “{target.char}”. Drag it on the canvas, or Shift+drag to move the whole line. Arrow keys nudge, [ and ]
        rotate.
      </p>
      <Range label="Nudge X" bind:value={() => ov.dx, (v) => set('dx', v)} min={-200} max={200} unit="px" />
      <Range label="Nudge Y" bind:value={() => ov.dy, (v) => set('dy', v)} min={-200} max={200} unit="px" />
      <Range label="Extra tilt" bind:value={() => ov.rot, (v) => set('rot', v)} min={-180} max={180} unit="°" />
      <Range label="Extra size" bind:value={() => ov.scale, (v) => set('scale', v)} min={0.3} max={2} step={0.01} unit="×" />
      <button class="btn small" type="button" onclick={resetLetter}>Reset this letter</button>
    {:else}
      <p class="hint">Click a letter on the canvas, or Tab to it, to move, tilt or resize it on its own.</p>
    {/if}
    <button class="btn small" type="button" disabled={!hasOverrides} onclick={resetAll}>Reset all letter edits</button>
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
    justify-items: stretch;
  }
  section > :global(.btn) {
    justify-self: start;
  }
  h3 {
    font-size: 17px;
  }
  .modes {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
  }
  .modes legend {
    margin-bottom: 4px;
  }
  .modes label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
  }
</style>

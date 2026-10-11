<script lang="ts">
  import { editor } from '../lib/store.svelte'
  import type { MaskKind } from '../lib/types'
  import ColorField from './ColorField.svelte'
  import Range from './Range.svelte'

  const mask = $derived(editor.design.mask)

  const KINDS: { value: MaskKind; label: string }[] = [
    { value: 'none', label: 'Off' },
    { value: 'wave', label: 'Wave' },
    { value: 'zigzag', label: 'Zigzag' },
    { value: 'straight', label: 'Straight cut' },
    { value: 'freehand', label: 'Draw my own' },
  ]

  const generated = $derived(mask.kind === 'wave' || mask.kind === 'zigzag' || mask.kind === 'straight')

  $effect(() => {
    if (mask.kind !== 'freehand' && editor.drawingMask) editor.drawingMask = false
  })
</script>

<div class="stack">
  <section>
    <h3>Second color</h3>
    <p class="hint">Paints part of the letters in a contrast color, like the crescent effect from a Figma mask.</p>
    <div class="seg" role="radiogroup" aria-label="Second color shape">
      {#each KINDS as k (k.value)}
        <label class:on={mask.kind === k.value}>
          <input type="radio" name="maskkind" value={k.value} bind:group={mask.kind} />
          {k.label}
        </label>
      {/each}
    </div>
  </section>

  {#if mask.kind !== 'none'}
    <section>
      <ColorField label="Second color" bind:value={mask.color} />
    </section>
  {/if}

  {#if generated}
    <section>
      <Range label="Height" bind:value={mask.position} min={0} max={1} step={0.01} />
      <Range label="Angle" bind:value={mask.angle} min={-60} max={60} unit="°" />
      {#if mask.kind !== 'straight'}
        <Range label="Wave height" bind:value={mask.amplitude} min={0} max={60} unit="px" />
        <Range label="Wave length" bind:value={mask.wavelength} min={20} max={500} unit="px" />
        <Range label="Slide" bind:value={mask.phase} min={0} max={1} step={0.01} />
      {/if}
      <label class="check"><input type="checkbox" bind:checked={mask.invert} /> Color the top part instead</label>
    </section>
  {/if}

  {#if mask.kind === 'freehand'}
    <section>
      {#if editor.drawingMask}
        <p class="hint">Drag on the canvas to draw. Letting go closes the shape.</p>
        <button class="btn" type="button" onclick={() => (editor.drawingMask = false)}>Stop drawing</button>
      {:else}
        <p class="hint">
          {mask.points.length > 2
            ? 'Your shape is set. Draw again to replace it.'
            : 'No shape yet. Start drawing, then drag across the letters on the canvas.'}
        </p>
        <button class="btn primary" type="button" onclick={() => (editor.drawingMask = true)}>Draw on canvas</button>
      {/if}
      <button class="btn small" type="button" disabled={mask.points.length === 0} onclick={() => (mask.points = [])}>
        Clear shape
      </button>
    </section>
  {/if}
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
  section > :global(.btn) {
    justify-self: start;
  }
  h3 {
    font-size: 17px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
</style>

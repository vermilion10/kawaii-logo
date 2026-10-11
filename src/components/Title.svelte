<script lang="ts">
  import { DEFAULT_FONT, fonts } from '../lib/fonts.svelte'
  import { buildScene } from '../lib/scene'
  import { defaultDesign, newBlock, newLayer } from '../lib/store.svelte'
  import type { Design } from '../lib/types'

  // The app title is drawn by the same engine as the logos it makes.
  const design: Design = {
    ...defaultDesign(),
    blocks: [newBlock({ text: 'Kawaii Logo Maker', size: 64, tracking: -1 })],
    fill: '#c92e52',
    jitter: { seed: 3, mode: 'alternate', rotate: 4, lift: 3, scale: 0 },
    layers: [newLayer({ expand: 6, color: '#ffffff' }), newLayer({ expand: 6, color: '#3b2230', dx: 4, dy: 4 })],
    mask: { ...defaultDesign().mask, color: '#ff8fae', position: 0.66, amplitude: 4, wavelength: 90 },
  }

  const scene = $derived(fonts.loaded[DEFAULT_FONT] ? buildScene(design, fonts.loaded, DEFAULT_FONT) : null)
</script>

<h1>
  {#if scene}
    <svg viewBox="{scene.viewBox.x} {scene.viewBox.y} {scene.viewBox.w} {scene.viewBox.h}" aria-hidden="true">
      {#each scene.layers as l (l.id)}<path d={l.d} fill={l.color} />{/each}
      <path d={scene.fillD} fill={scene.fillColor} />
      {#if scene.maskD}<path d={scene.maskD} fill={scene.maskColor} />{/if}
    </svg>
    <span class="visually-hidden">Kawaii Logo Maker</span>
  {:else}
    <span class="plain">Kawaii Logo Maker</span>
  {/if}
</h1>

<style>
  h1 {
    display: flex;
    align-items: center;
    height: 52px;
    font-size: 24px;
  }
  svg {
    height: 100%;
    width: auto;
    max-width: 100%;
  }
  .plain {
    color: var(--accent);
  }
  @media (max-width: 520px) {
    h1 {
      height: 40px;
    }
  }
</style>

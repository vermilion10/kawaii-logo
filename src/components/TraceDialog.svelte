<script lang="ts">
  import { loadImage, rasterize, runTrace, toArtLayers } from '../lib/tracer'
  import type { TraceInput, TraceOptions, TraceResult } from '../lib/trace'
  import type { Artwork } from '../lib/types'
  import ColorField from './ColorField.svelte'
  import Range from './Range.svelte'

  let {
    file,
    defaultColor,
    onclose,
    onadd,
  }: {
    file: File | null
    defaultColor: string
    onclose: () => void
    onadd: (art: Artwork, color: string) => void
  } = $props()

  let dialog = $state<HTMLDialogElement>()
  let img = $state<HTMLImageElement | null>(null)
  let raster: TraceInput | null = null
  let result = $state.raw<TraceResult | null>(null)
  let status = $state<'loading' | 'tracing' | 'ready' | 'error'>('loading')
  let error = $state('')
  let color = $state('#3b2230')
  let detail = $state(512)
  let options = $state<TraceOptions>({
    mode: 'silhouette',
    threshold: 128,
    invert: false,
    colors: 4,
    removeBg: true,
    smooth: 2,
    speck: 12,
  })

  const DETAILS = [
    { value: 256, label: 'Low' },
    { value: 512, label: 'Medium' },
    { value: 1024, label: 'High' },
  ]

  $effect(() => {
    if (!file) return
    const f = file
    color = defaultColor
    status = 'loading'
    result = null
    error = ''
    dialog?.showModal()
    loadImage(f).then(
      (loaded) => {
        if (f !== file) return URL.revokeObjectURL(loaded.src)
        img = loaded
      },
      (err: Error) => {
        status = 'error'
        error = err.message
      },
    )
    return () => {
      if (img) URL.revokeObjectURL(img.src)
      img = null
      raster = null
    }
  })

  // Rasterizing only depends on the detail level; tracing reruns on every option change.
  let rasterKey = ''
  let job = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    if (!img) return
    const opts = { ...options }
    const size = detail
    const source = img
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const id = ++job
      status = 'tracing'
      try {
        const key = source.src + ':' + size
        if (!raster || rasterKey !== key) {
          raster = rasterize(source, size)
          rasterKey = key
        }
        const r = await runTrace(raster, opts)
        if (id !== job) return
        result = r
        status = 'ready'
      } catch (err) {
        if (id !== job) return
        status = 'error'
        error = (err as Error).message
      }
    }, 120)
  })

  const oneColor = $derived(options.mode === 'silhouette')
  const empty = $derived(!!result && result.layers.length === 0)

  function close() {
    dialog?.close()
  }

  function add() {
    if (!result || !file || empty) return
    const name = file.name.replace(/\.[^.]+$/, '')
    onadd({ name, layers: toArtLayers(result, oneColor ? color : null), oneColor }, color)
    close()
  }

  const toD = (c: number[]) => {
    let d = 'M' + c[0] + ' ' + c[1]
    for (let i = 2; i < c.length; i += 2) d += 'L' + c[i].toFixed(1) + ' ' + c[i + 1].toFixed(1)
    return d + 'Z'
  }
</script>

<dialog bind:this={dialog} onclose={onclose} aria-labelledby="trace-title">
  <form method="dialog" class="shell" onsubmit={(e) => e.preventDefault()}>
    <header>
      <h2 id="trace-title">Trace an image</h2>
      {#if file}<p class="hint">{file.name}</p>{/if}
    </header>

    <div class="body">
      <div class="previews">
        <figure>
          <figcaption class="field-label">Original</figcaption>
          <div class="frame">
            {#if img}<img src={img.src} alt={file?.name ?? "Source"} />{/if}
          </div>
        </figure>
        <figure>
          <figcaption class="field-label">Traced</figcaption>
          <div class="frame">
            {#if result && !empty}
              <svg viewBox="0 0 {result.width} {result.height}" role="img" aria-label="Traced shapes">
                {#each result.layers as layer, i (i)}
                  <path d={layer.contours.map(toD).join('')} fill={oneColor ? color : layer.color} />
                {/each}
              </svg>
            {/if}
          </div>
        </figure>
        <p class="status" role="status">
          {#if status === 'loading'}
            Reading the image…
          {:else if status === 'tracing'}
            Tracing…
          {:else if status === 'error'}
            <span class="error">{error}</span>
          {:else if empty}
            Nothing was found with these settings. Move the threshold, or switch between one color and keep colors.
          {:else if result}
            {result.layers.length} {result.layers.length === 1 ? 'color' : 'colors'}, {result.points.toLocaleString()} points{result.points >
            25000
              ? '. That is a lot; lower the detail or raise the smoothness to keep the editor fast.'
              : ''}
          {/if}
        </p>
      </div>

      <div class="controls">
        <div class="seg" role="radiogroup" aria-label="Tracing mode">
          <label class:on={options.mode === 'silhouette'}>
            <input type="radio" name="tmode" value="silhouette" bind:group={options.mode} /> One color
          </label>
          <label class:on={options.mode === 'colors'}>
            <input type="radio" name="tmode" value="colors" bind:group={options.mode} /> Keep colors
          </label>
        </div>

        {#if options.mode === 'silhouette'}
          <Range label="Threshold" bind:value={options.threshold} min={1} max={254} />
          <p class="hint">
            {result?.hasAlpha
              ? 'This image is transparent: pixels more opaque than the threshold are kept.'
              : 'Pixels darker than the threshold are kept.'}
          </p>
          <label class="check"><input type="checkbox" bind:checked={options.invert} /> Invert (keep the other part)</label>
          <ColorField label="Color" bind:value={color} />
        {:else}
          <Range label="Number of colors" bind:value={options.colors} min={1} max={8} />
          {#if result && !result.hasAlpha}
            <label class="check"><input type="checkbox" bind:checked={options.removeBg} /> Remove the background color</label>
          {/if}
        {/if}

        <fieldset class="seg-field">
          <legend class="field-label">Detail</legend>
          <div class="seg">
            {#each DETAILS as d (d.value)}
              <label class:on={detail === d.value}>
                <input type="radio" name="tdetail" value={d.value} bind:group={detail} />
                {d.label}
              </label>
            {/each}
          </div>
        </fieldset>
        <Range label="Smoothness" bind:value={options.smooth} min={0} max={5} />
        <Range label="Ignore specks smaller than" bind:value={options.speck} min={0} max={400} unit="px²" />
      </div>
    </div>

    <footer>
      <button class="btn" type="button" onclick={close}>Cancel</button>
      <button class="btn primary" type="button" disabled={status !== 'ready' || empty} onclick={add}>Add to logo</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(920px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    border: 2px solid var(--line);
    border-radius: var(--r-lg);
    background: var(--surface);
    color: var(--ink);
  }
  dialog::backdrop {
    background: rgb(29 20 24 / 0.55);
  }
  .shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    max-height: calc(100dvh - 36px);
  }
  header {
    padding: 16px 20px 8px;
  }
  h2 {
    font-size: 22px;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: 20px;
    padding: 8px 20px;
    overflow-y: auto;
  }
  .previews {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-content: start;
  }
  figure {
    margin: 0;
    display: grid;
    gap: 4px;
  }
  .frame {
    aspect-ratio: 1;
    border: 2px solid var(--line);
    border-radius: var(--r-md);
    background: repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%) 0 0 / 16px 16px;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .frame img,
  .frame svg {
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .status {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 14px;
    min-height: 2.6em;
  }
  .error {
    color: var(--accent);
    font-weight: 700;
  }
  .controls {
    display: grid;
    gap: 12px;
    align-content: start;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .seg-field {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 20px 16px;
    border-top: 2px solid var(--line);
  }
  @media (max-width: 720px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

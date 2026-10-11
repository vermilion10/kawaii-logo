<script lang="ts">
  import { defaultDesign, editor } from '../lib/store.svelte'
  import { sanitizeDesign } from '../lib/sanitize'
  import { download, fileSlug, sceneToSvg, svgToPng } from '../lib/export'
  import { DEFAULT_FONT, fonts } from '../lib/fonts.svelte'
  import type { Scene } from '../lib/scene'
  import { shareUrl } from '../lib/share'

  let { scene, say }: { scene: Scene; say: (text: string, tone?: 'info' | 'error') => void } = $props()

  let busy = $state(false)
  const empty = $derived(!scene.fillD && scene.decos.length === 0)
  const name = $derived(fileSlug(editor.design.blocks[0]?.text ?? 'logo'))
  const size = $derived(`${Math.ceil(scene.viewBox.w)} × ${Math.ceil(scene.viewBox.h)} px`)

  async function png(scale: number) {
    busy = true
    try {
      download(await svgToPng(sceneToSvg(scene), scale), `${name}@${scale}x.png`)
      say(`Saved ${name}@${scale}x.png`)
    } catch (err) {
      say(`PNG export failed: ${(err as Error).message}`, 'error')
    } finally {
      busy = false
    }
  }

  function svg() {
    download(new Blob([sceneToSvg(scene)], { type: 'image/svg+xml' }), `${name}.svg`)
    say(`Saved ${name}.svg`)
  }

  async function copySvg() {
    try {
      await navigator.clipboard.writeText(sceneToSvg(scene))
      say('SVG copied. Paste it straight into Figma.')
    } catch {
      say('The browser blocked clipboard access. Use Download SVG instead.', 'error')
    }
  }

  function saveProject() {
    download(new Blob([JSON.stringify(editor.design, null, 2)], { type: 'application/json' }), `${name}.kawaii.json`)
    say(`Saved ${name}.kawaii.json`)
  }

  async function openProject(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const parsed = sanitizeDesign(JSON.parse(await file.text()), DEFAULT_FONT)
      if (!parsed) throw new Error('not a Kawaii Logo Maker project')
      const unknown = parsed.blocks.filter((b) => !fonts.entry(b.fontId)).map((b) => b.fontId.replace(/^user:/, ''))
      editor.replace(parsed)
      say(
        unknown.length
          ? `Opened. Add the font file for ${[...new Set(unknown)].join(', ')} to see the original lettering.`
          : `Opened ${file.name}`,
      )
    } catch (err) {
      say(`Could not open ${file.name}: ${(err as Error).message}`, 'error')
    }
  }

  let link = $state('')
  let linkCopied = $state(false)
  const userFonts = $derived([...new Set(editor.design.blocks.filter((b) => b.fontId.startsWith('user:')).map((b) => b.fontId.slice(5)))])

  async function makeLink() {
    linkCopied = false
    try {
      link = await shareUrl($state.snapshot(editor.design))
    } catch (err) {
      say(`Could not build the link: ${(err as Error).message}`, 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      linkCopied = true
      say('Share link copied.')
    } catch {
      say('The browser blocked clipboard access. Copy the link from the box below.', 'error')
    }
  }

  function startOver() {
    if (confirm('Start over with the default logo? You can undo this with Ctrl+Z.')) editor.replace(defaultDesign())
  }
</script>

<div class="stack">
  <section>
    <h3>Download</h3>
    <p class="hint">
      {empty ? 'Nothing to export yet. Add some text first.' : `Exports at ${size}, outlines included as real shapes.`}
    </p>
    <button class="btn primary" type="button" disabled={empty} onclick={svg}>Download SVG</button>
    <div class="row">
      {#each [1, 2, 4] as s (s)}
        <button class="btn" type="button" disabled={empty || busy} onclick={() => png(s)}>PNG {s}×</button>
      {/each}
    </div>
    <button class="btn small" type="button" disabled={empty} onclick={copySvg}>Copy SVG code</button>
  </section>

  <section>
    <h3>Share link</h3>
    <p class="hint">The whole design is packed into the link itself, so nothing is uploaded. Opening it loads the design for editing.</p>
    {#if userFonts.length}
      <p class="hint">Fonts are not included. People without {userFonts.join(', ')} will see the default font instead.</p>
    {/if}
    <button class="btn" type="button" onclick={makeLink}>Copy share link</button>
    {#if link}
      <label class="field-label" for="share-link">{linkCopied ? 'Copied to your clipboard' : 'Your link'}</label>
      <input id="share-link" type="text" readonly value={link} onfocus={(e) => e.currentTarget.select()} />
      {#if link.length > 8000}
        <p class="hint">
          This link is {Math.round(link.length / 1000)}k characters long, mostly from traced artwork. Some chat apps cut long
          links; send the project file instead if it does not open.
        </p>
      {/if}
    {/if}
  </section>

  <section>
    <h3>Project file</h3>
    <p class="hint">Saves every setting so you can keep editing later. Your work is also kept in this browser automatically.</p>
    <div class="row">
      <button class="btn" type="button" onclick={saveProject}>Save project</button>
      <label class="btn file">
        Open project
        <input type="file" accept=".json,application/json" onchange={openProject} />
      </label>
    </div>
    <button class="btn small" type="button" onclick={startOver}>Start over</button>
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
  section > :global(.btn) {
    justify-self: start;
  }
  h3 {
    font-size: 17px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .file {
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
</style>

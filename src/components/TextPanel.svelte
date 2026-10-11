<script lang="ts">
  import { editor, newBlock } from '../lib/store.svelte'
  import { fonts } from '../lib/fonts.svelte'
  import Range from './Range.svelte'

  let { onFontFile }: { onFontFile: (file: File, blockId: string) => void } = $props()

  const blocks = $derived(editor.design.blocks)

  function addLine() {
    const last = blocks[blocks.length - 1]
    editor.design.blocks.push(newBlock({ text: 'New line', size: 56, y: (last?.y ?? 0) + 110, fontId: last?.fontId }))
  }

  function removeLine(id: string) {
    editor.design.blocks = editor.design.blocks.filter((b) => b.id !== id)
    if (editor.selection?.kind === 'letter' && editor.selection.blockId === id) editor.selection = null
  }

  function pick(e: Event, blockId: string) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file) onFontFile(file, blockId)
    input.value = ''
  }
</script>

<div class="stack">
  {#each blocks as block, i (block.id)}
    <section class="block" aria-labelledby="line-{block.id}">
      <div class="head">
        <h3 id="line-{block.id}">{i === 0 ? 'Main text' : `Line ${i + 1}`}</h3>
        {#if i > 0}
          <button class="btn small" type="button" onclick={() => removeLine(block.id)}>Remove line</button>
        {/if}
      </div>

      <label class="field-label" for="text-{block.id}">Text</label>
      <input id="text-{block.id}" type="text" bind:value={block.text} placeholder="Your name" />

      <label class="field-label" for="font-{block.id}">Font</label>
      <select
        id="font-{block.id}"
        bind:value={block.fontId}
        onchange={() => fonts.ensure(block.fontId)}
      >
        <optgroup label="Free fonts (SIL OFL)">
          {#each fonts.all.filter((f) => !f.user) as f (f.id)}
            <option value={f.id}>{f.name}</option>
          {/each}
        </optgroup>
        {#if fonts.userFonts.length}
          <optgroup label="Your fonts">
            {#each fonts.userFonts as f (f.id)}
              <option value={f.id}>{f.name}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
      <p class="hint">
        {fonts.entry(block.fontId)?.note ?? 'Font not found, using Mochiy Pop P One.'}
        {#if fonts.status[block.fontId] === 'loading'} Loading font…{/if}
        {#if fonts.status[block.fontId] === 'error'} This font failed to download. Check your connection and pick it again.{/if}
      </p>

      <label class="btn small file">
        Use my own font file
        <input type="file" accept=".ttf,.otf,.woff,font/ttf,font/otf,font/woff" onchange={(e) => pick(e, block.id)} />
      </label>

      <Range label="Size" bind:value={block.size} min={16} max={320} unit="px" />
      <Range label="Letter spacing" bind:value={block.tracking} min={-60} max={80} unit="px" />
      <div class="pair">
        <Range label="Move X" bind:value={block.x} min={-600} max={600} />
        <Range label="Move Y" bind:value={block.y} min={-400} max={400} />
      </div>
      <label class="check">
        <input type="checkbox" bind:checked={block.jitter} />
        Bounce these letters (settings in the Letters tab)
      </label>
    </section>
  {/each}

  <button class="btn" type="button" onclick={addLine}>Add a text line</button>

  <div class="note">
    <h3>About fonts</h3>
    <p class="hint">
      The built-in fonts are free under the SIL Open Font License. If you own a commercial font such as FOT-Yuruka
      Std, add its .ttf, .otf or .woff file here or drop it on the page. It is read in your browser and never
      uploaded. Check the font's license before you publish a logo made with it.
    </p>
    {#if fonts.userFonts.length}
      <ul>
        {#each fonts.userFonts as f (f.id)}
          <li>
            <span>{f.name}</span>
            <button class="btn small" type="button" onclick={() => fonts.removeUserFont(f.id)}>Forget</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .stack {
    display: grid;
    gap: 18px;
  }
  .block {
    display: grid;
    gap: 8px;
    padding-bottom: 18px;
    border-bottom: 2px dashed var(--line);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  h3 {
    font-size: 17px;
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
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .note {
    display: grid;
    gap: 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
</style>

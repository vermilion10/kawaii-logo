<script lang="ts">
  let { label, value = $bindable() }: { label: string; value: string } = $props()

  const id = 'c' + Math.random().toString(36).slice(2, 8)
  let draft = $state('')
  $effect(() => {
    draft = value
  })

  function commit() {
    const v = draft.trim()
    const hex = v.startsWith('#') ? v : '#' + v
    if (/^#[0-9a-f]{6}$/i.test(hex)) value = hex.toLowerCase()
    else if (/^#[0-9a-f]{3}$/i.test(hex))
      value = ('#' + [...hex.slice(1)].map((c) => c + c).join('')).toLowerCase()
    else draft = value
  }
</script>

<div class="color">
  <label class="field-label" for={id}>{label}</label>
  <div class="row">
    <input class="swatch" type="color" aria-label="{label} picker" bind:value />
    <input
      {id}
      type="text"
      spellcheck="false"
      bind:value={draft}
      onchange={commit}
      onkeydown={(e) => e.key === 'Enter' && commit()}
    />
  </div>
</div>

<style>
  .color {
    display: grid;
    gap: 2px;
  }
  .row {
    display: grid;
    grid-template-columns: 44px 1fr;
    gap: 8px;
  }
  .swatch {
    width: 44px;
    height: 40px;
    padding: 2px;
    border: 2px solid var(--line);
    border-radius: var(--r-md);
    background: var(--surface);
    cursor: pointer;
  }
  input[type='text'] {
    font-family: ui-monospace, monospace;
    font-size: 14px;
  }
</style>

<script lang="ts">
  let {
    label,
    value = $bindable(),
    min,
    max,
    step = 1,
    unit = '',
  }: { label: string; value: number; min: number; max: number; step?: number; unit?: string } = $props()

  const id = 'r' + Math.random().toString(36).slice(2, 8)

  function onNumber(e: Event) {
    const v = parseFloat((e.currentTarget as HTMLInputElement).value)
    if (Number.isFinite(v)) value = v
  }
</script>

<div class="range">
  <label class="field-label" for={id}>{label}</label>
  <div class="row">
    <input {id} type="range" {min} {max} {step} bind:value />
    <span class="num">
      <input type="number" aria-label="{label} value" {step} value={value} onchange={onNumber} />
      {#if unit}<span class="unit">{unit}</span>{/if}
    </span>
  </div>
</div>

<style>
  .range {
    display: grid;
    gap: 2px;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
  }
  .num {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .num input {
    width: 72px;
    min-height: 34px;
    padding: 2px 6px;
    text-align: right;
  }
  @media (pointer: coarse) {
    .num input {
      min-height: 44px;
    }
  }
  .unit {
    font-size: 12px;
    color: var(--ink-soft);
    width: 1.2em;
  }
</style>

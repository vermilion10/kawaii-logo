<script lang="ts">
  import { editor } from '../lib/store.svelte'
  import { NO_OVERRIDE, type Scene } from '../lib/scene'
  import type { Box, LetterOverride, Selection } from '../lib/types'

  let { scene, notice }: { scene: Scene; notice: { tone: 'info' | 'error'; text: string } | null } = $props()

  let svg = $state<SVGSVGElement>()
  let wrapW = $state(0)
  let wrapH = $state(0)
  // The view box is held still during a drag so the artwork does not rescale under the pointer.
  let frozen = $state<Box | null>(null)
  const vb = $derived(frozen ?? scene.viewBox)
  const unit = $derived(wrapW && wrapH ? Math.max(vb.w / wrapW, vb.h / wrapH) : 1)

  type DragKind = 'letter-move' | 'letter-rotate' | 'block-move' | 'deco-move' | 'deco-rotate' | 'deco-scale' | 'draw'
  interface Drag {
    kind: DragKind
    sx: number
    sy: number
    cx: number
    cy: number
    orig: { x: number; y: number; rot: number; size: number }
  }
  let drag: Drag | null = null
  let drawPts = $state<[number, number][]>([])

  const selected = $derived.by(() => {
    const s = editor.selection
    if (!s) return null
    if (s.kind === 'letter') {
      const l = scene.letters.find((g) => g.blockId === s.blockId && g.index === s.index)
      return l ? { kind: 'letter' as const, box: l.box, cx: l.cx, cy: l.cy } : null
    }
    const d = scene.decos.find((g) => g.id === s.id)
    return d ? { kind: 'deco' as const, box: d.box, cx: d.cx, cy: d.cy } : null
  })

  function toLocal(e: PointerEvent): [number, number] {
    const ctm = svg?.getScreenCTM()
    if (!ctm) return [0, 0]
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return [p.x, p.y]
  }

  function override(blockId: string, index: number): LetterOverride | null {
    const block = editor.block(blockId)
    if (!block) return null
    block.overrides[index] ??= { ...NO_OVERRIDE }
    return block.overrides[index]
  }

  function begin(e: PointerEvent, kind: DragKind, cx: number, cy: number, orig: Drag['orig']) {
    const [x, y] = toLocal(e)
    drag = { kind, sx: x, sy: y, cx, cy, orig }
    frozen = scene.viewBox
    editor.dragging = true
    try {
      svg?.setPointerCapture(e.pointerId)
    } catch {
      // Capture fails for pointers that are already released; the drag still works without it.
    }
  }

  function onLetterDown(e: PointerEvent, blockId: string, index: number, cx: number, cy: number) {
    if (editor.drawingMask || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    editor.selection = { kind: 'letter', blockId, index }
    if (e.shiftKey) {
      const b = editor.block(blockId)
      if (b) begin(e, 'block-move', cx, cy, { x: b.x, y: b.y, rot: 0, size: 0 })
    } else {
      const ov = editor.block(blockId)?.overrides[index] ?? NO_OVERRIDE
      begin(e, 'letter-move', cx, cy, { x: ov.dx, y: ov.dy, rot: ov.rot, size: ov.scale })
    }
  }

  function onDecoDown(e: PointerEvent, id: string) {
    if (editor.drawingMask || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    editor.selection = { kind: 'deco', id }
    const d = editor.deco(id)
    if (d) begin(e, 'deco-move', d.x, d.y, { x: d.x, y: d.y, rot: d.rot, size: d.size })
  }

  function onHandleDown(e: PointerEvent, which: 'rotate' | 'scale') {
    e.stopPropagation()
    e.preventDefault()
    const s = editor.selection
    if (!s || !selected) return
    if (s.kind === 'letter') {
      const ov = editor.block(s.blockId)?.overrides[s.index] ?? NO_OVERRIDE
      begin(e, 'letter-rotate', selected.cx, selected.cy, { x: ov.dx, y: ov.dy, rot: ov.rot, size: ov.scale })
    } else {
      const d = editor.deco(s.id)
      if (d) begin(e, which === 'rotate' ? 'deco-rotate' : 'deco-scale', d.x, d.y, { x: d.x, y: d.y, rot: d.rot, size: d.size })
    }
  }

  function onBackgroundDown(e: PointerEvent) {
    if (e.button !== 0) return
    if (editor.drawingMask) {
      e.preventDefault()
      drawPts = [toLocal(e)]
      begin(e, 'draw', 0, 0, { x: 0, y: 0, rot: 0, size: 0 })
      return
    }
    editor.selection = null
  }

  // iOS Safari can still scroll from SVG children despite touch-action, so active drags cancel it.
  $effect(() => {
    const el = svg
    if (!el) return
    const block = (e: TouchEvent) => {
      if (drag) e.preventDefault()
    }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  })

  const angle = (x: number, y: number, cx: number, cy: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI

  // Pointer events can outpace the display; only the latest position per frame is applied.
  let pending: PointerEvent | null = null
  let frame = 0

  function onMove(e: PointerEvent) {
    if (!drag) return
    pending = e
    if (!frame) frame = requestAnimationFrame(flushMove)
  }

  function flushMove() {
    frame = 0
    const e = pending
    pending = null
    if (e) applyMove(e)
  }

  function applyMove(e: PointerEvent) {
    if (!drag) return
    const [x, y] = toLocal(e)
    const dx = x - drag.sx
    const dy = y - drag.sy
    const s = editor.selection
    switch (drag.kind) {
      case 'draw': {
        const last = drawPts[drawPts.length - 1]
        if (Math.hypot(x - last[0], y - last[1]) > 3 * unit) drawPts.push([x, y])
        break
      }
      case 'letter-move':
      case 'letter-rotate': {
        if (s?.kind !== 'letter') break
        const ov = override(s.blockId, s.index)
        if (!ov) break
        if (drag.kind === 'letter-move') {
          ov.dx = Math.round(drag.orig.x + dx)
          ov.dy = Math.round(drag.orig.y + dy)
        } else {
          ov.rot = Math.round(drag.orig.rot + angle(x, y, drag.cx, drag.cy) - angle(drag.sx, drag.sy, drag.cx, drag.cy))
        }
        break
      }
      case 'block-move': {
        if (s?.kind !== 'letter') break
        const b = editor.block(s.blockId)
        if (b) {
          b.x = Math.round(drag.orig.x + dx)
          b.y = Math.round(drag.orig.y + dy)
        }
        break
      }
      default: {
        if (s?.kind !== 'deco') break
        const d = editor.deco(s.id)
        if (!d) break
        if (drag.kind === 'deco-move') {
          d.x = Math.round(drag.orig.x + dx)
          d.y = Math.round(drag.orig.y + dy)
        } else if (drag.kind === 'deco-rotate') {
          d.rot = Math.round(drag.orig.rot + angle(x, y, drag.cx, drag.cy) - angle(drag.sx, drag.sy, drag.cx, drag.cy))
        } else {
          const d0 = Math.hypot(drag.sx - drag.cx, drag.sy - drag.cy) || 1
          d.size = Math.max(8, Math.round((drag.orig.size * Math.hypot(x - drag.cx, y - drag.cy)) / d0))
        }
      }
    }
  }

  function onUp() {
    if (frame) {
      cancelAnimationFrame(frame)
      flushMove()
    }
    if (!drag) return
    if (drag.kind === 'draw') {
      if (drawPts.length > 2) {
        editor.design.mask.points = drawPts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
        editor.drawingMask = false
      }
      drawPts = []
    }
    drag = null
    frozen = null
    editor.dragging = false
    editor.record()
  }

  function onTargetKey(e: KeyboardEvent, s: NonNullable<Selection>) {
    editor.selection = s
    const step = e.shiftKey ? 10 : 1
    const turn = e.shiftKey ? 15 : 3
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    let handled = true
    if (s.kind === 'letter') {
      const ov = override(s.blockId, s.index)
      if (!ov) return
      if (move[e.key]) {
        ov.dx += move[e.key][0]
        ov.dy += move[e.key][1]
      } else if (e.key === '[') ov.rot -= turn
      else if (e.key === ']') ov.rot += turn
      else if (e.key === '-') ov.scale = Math.max(0.2, Math.round((ov.scale - 0.05) * 100) / 100)
      else if (e.key === '=' || e.key === '+') ov.scale = Math.round((ov.scale + 0.05) * 100) / 100
      else if (e.key === '0') Object.assign(ov, NO_OVERRIDE)
      else handled = false
    } else {
      const d = editor.deco(s.id)
      if (!d) return
      if (move[e.key]) {
        d.x += move[e.key][0]
        d.y += move[e.key][1]
      } else if (e.key === '[') d.rot -= turn
      else if (e.key === ']') d.rot += turn
      else if (e.key === '-') d.size = Math.max(8, Math.round(d.size * 0.92))
      else if (e.key === '=' || e.key === '+') d.size = Math.round(d.size * 1.08)
      else if (e.key === 'Delete' || e.key === 'Backspace') editor.removeDecoration(d.id)
      else handled = false
    }
    if (e.key === 'Escape') {
      editor.selection = null
      ;(e.currentTarget as SVGElement).blur()
      handled = true
    }
    if (handled) e.preventDefault()
  }

  const blockIndex = (id: string) => editor.design.blocks.findIndex((b) => b.id === id) + 1
</script>

<div
  class="stage bg-{editor.design.previewBg}"
  class:drawing={editor.drawingMask}
  bind:clientWidth={wrapW}
  bind:clientHeight={wrapH}
>
  <svg
    bind:this={svg}
    viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
    role="application"
    aria-label="Logo canvas. Tab to a letter or decoration, then use arrow keys to move it, [ and ] to rotate, minus and plus to resize."
    onpointerdown={onBackgroundDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
  >
    <g class="art">
      {#each scene.layers as l (l.id)}
        <path d={l.d} fill={l.color} />
      {/each}
      <path d={scene.fillD} fill={scene.fillColor} />
      {#if scene.maskD}<path d={scene.maskD} fill={scene.maskColor} />{/if}
      {#each scene.decos as d (d.id)}
        {#each d.parts as p, i (i)}<path d={p.d} fill={p.color} />{/each}
      {/each}
    </g>

    <g class="hits" class:off={editor.drawingMask}>
      {#each scene.letters as l (l.blockId + ':' + l.index)}
        <path
          class="hit"
          d={l.d}
          role="button"
          tabindex="0"
          aria-label="Letter {l.char}, line {blockIndex(l.blockId)}"
          onpointerdown={(e) => onLetterDown(e, l.blockId, l.index, l.cx, l.cy)}
          onfocus={() => (editor.selection = { kind: 'letter', blockId: l.blockId, index: l.index })}
          onkeydown={(e) => onTargetKey(e, { kind: 'letter', blockId: l.blockId, index: l.index })}
        />
      {/each}
      {#each scene.decos as d (d.id)}
        <path
          class="hit"
          d={d.d}
          role="button"
          tabindex="0"
          aria-label={editor.deco(d.id)?.shape === 'art' ? 'Traced image' : 'Decoration'}
          onpointerdown={(e) => onDecoDown(e, d.id)}
          onfocus={() => (editor.selection = { kind: 'deco', id: d.id })}
          onkeydown={(e) => onTargetKey(e, { kind: 'deco', id: d.id })}
        />
      {/each}
    </g>

    {#if editor.design.mask.kind === 'freehand' && editor.design.mask.points.length > 2 && editor.drawingMask}
      <polygon
        class="guide"
        points={editor.design.mask.points.map((p) => p.join(',')).join(' ')}
        stroke-width={1.5 * unit}
        stroke-dasharray="{6 * unit} {4 * unit}"
      />
    {/if}
    {#if drawPts.length > 1}
      <polyline class="pen" points={drawPts.map((p) => p.join(',')).join(' ')} stroke-width={2 * unit} />
    {/if}

    {#if selected && !editor.drawingMask}
      {@const b = selected.box}
      {@const pad = 6 * unit}
      <g class="selection">
        <rect
          x={b.x - pad}
          y={b.y - pad}
          width={b.w + pad * 2}
          height={b.h + pad * 2}
          stroke-width={1.5 * unit}
          stroke-dasharray="{5 * unit} {4 * unit}"
          rx={4 * unit}
        />
        <line x1={b.x + b.w / 2} y1={b.y - pad} x2={b.x + b.w / 2} y2={b.y - pad - 22 * unit} stroke-width={1.5 * unit} />
        <g
          class="handle"
          role="slider"
          tabindex="-1"
          aria-label="Rotate"
          aria-valuenow={0}
          onpointerdown={(e) => onHandleDown(e, 'rotate')}
        >
          <circle cx={b.x + b.w / 2} cy={b.y - pad - 22 * unit} r={16 * unit} class="grab" />
          <circle cx={b.x + b.w / 2} cy={b.y - pad - 22 * unit} r={7 * unit} stroke-width={2 * unit} />
        </g>
        {#if selected.kind === 'deco'}
          <g
            class="handle"
            role="slider"
            tabindex="-1"
            aria-label="Resize"
            aria-valuenow={0}
            onpointerdown={(e) => onHandleDown(e, 'scale')}
          >
            <circle cx={b.x + b.w + pad} cy={b.y + b.h + pad} r={16 * unit} class="grab" />
            <rect
              x={b.x + b.w + pad - 6 * unit}
              y={b.y + b.h + pad - 6 * unit}
              width={12 * unit}
              height={12 * unit}
              stroke-width={2 * unit}
            />
          </g>
        {/if}
      </g>
    {/if}
  </svg>

  {#if editor.drawingMask}
    <p class="notice" role="status">Draw a closed shape over the letters. The area inside gets the second color.</p>
  {:else if notice}
    <p class="notice" class:error={notice.tone === 'error'} role={notice.tone === 'error' ? 'alert' : 'status'}>
      {notice.text}
    </p>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 260px;
    border-radius: var(--r-lg);
    border: 2px solid var(--line);
    overflow: hidden;
  }
  /* The checkerboard marks transparent pixels, which is what PNG export produces. */
  .bg-checker {
    background: repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%) 0 0 / 24px 24px;
  }
  .bg-light {
    background: #ffffff;
  }
  .bg-dark {
    background: #1a1a1a;
  }
  /* Touches on the canvas edit the logo; the settings below are where the page scrolls. */
  svg {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
  }
  .drawing svg {
    cursor: crosshair;
  }
  .hit {
    fill: transparent;
    cursor: grab;
    touch-action: none;
    outline: none;
  }
  .hits.off {
    pointer-events: none;
  }
  .selection rect,
  .selection line {
    fill: none;
    stroke: var(--accent);
  }
  .handle {
    cursor: grab;
    touch-action: none;
  }
  .handle circle:not(.grab),
  .handle rect {
    fill: var(--surface);
    stroke: var(--accent);
  }
  .handle .grab {
    fill: transparent;
  }
  .guide {
    fill: none;
    stroke: var(--accent);
  }
  .pen {
    fill: none;
    stroke: var(--accent);
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .notice {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--r-md);
    background: var(--surface);
    border: 2px solid var(--line);
    font-size: 14px;
  }
  .notice.error {
    border-color: var(--accent);
  }
</style>

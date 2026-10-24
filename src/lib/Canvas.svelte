<script lang="ts">
  import Module from './Module.svelte'
  import { NODE_TYPES, PORT_OFFSET, nodeWidth, type GraphEdge, type GraphNode } from './types'

  interface Props {
    nodes: GraphNode[]
    edges: GraphEdge[]
    selectedId: string | null
    onSelect: (id: string | null) => void
    onRemove: (id: string) => void
    onMove: (id: string, x: number, y: number) => void
    onParam: (id: string, key: string, value: string | number) => void
    onToggle: (id: string) => void
    onConnect: (from: string, to: string) => void
    onContextMenu: (clientX: number, clientY: number, worldX: number, worldY: number) => void
  }

  let {
    nodes = $bindable(),
    edges,
    selectedId,
    onSelect,
    onRemove,
    onMove,
    onParam,
    onToggle,
    onConnect,
    onContextMenu,
  }: Props = $props()

  let panX = $state(220)
  let panY = $state(80)
  let scale = $state(1)
  let panning = $state(false)
  let px = 0
  let py = 0
  let linkingFrom = $state<string | null>(null)
  let draftPos = $state<{ x: number; y: number } | null>(null)
  let surfaceEl: HTMLElement | undefined = $state()

  function worldFromClient(clientX: number, clientY: number) {
    const r = surfaceEl!.getBoundingClientRect()
    return {
      x: (clientX - r.left - panX) / scale,
      y: (clientY - r.top - panY) / scale,
    }
  }

  function portCenter(node: GraphNode, side: 'in' | 'out') {
    return {
      x: node.x + (side === 'out' ? nodeWidth(node.kind) : 0),
      y: node.y + PORT_OFFSET,
    }
  }

  function cablePath(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.max(24, Math.abs(x2 - x1) * 0.4)
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    const next = Math.min(1.8, Math.max(0.45, scale * delta))
    const r = surfaceEl!.getBoundingClientRect()
    const cx = e.clientX - r.left
    const cy = e.clientY - r.top
    const wx = (cx - panX) / scale
    const wy = (cy - panY) / scale
    scale = next
    panX = cx - wx * scale
    panY = cy - wy * scale
  }

  function bgDown(e: PointerEvent) {
    if (e.button === 1 || e.altKey || (e.button === 0 && (e.target as HTMLElement).classList.contains('surface'))) {
      panning = true
      px = e.clientX - panX
      py = e.clientY - panY
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      onSelect(null)
    }
  }

  function onCtx(e: MouseEvent) {
    e.preventDefault()
    const t = e.target as HTMLElement
    if (t.closest('[data-module]')) return
    const w = worldFromClient(e.clientX, e.clientY)
    onContextMenu(e.clientX, e.clientY, w.x, w.y)
  }

  function bgMove(e: PointerEvent) {
    if (panning) {
      panX = e.clientX - px
      panY = e.clientY - py
    }
    if (linkingFrom) {
      draftPos = worldFromClient(e.clientX, e.clientY)
    }
  }

  function hitInPort(clientX: number, clientY: number): string | null {
    const w = worldFromClient(clientX, clientY)
    for (const n of nodes) {
      if (NODE_TYPES[n.kind].inputs < 1) continue
      const c = portCenter(n, 'in')
      const dx = w.x - c.x
      const dy = w.y - c.y
      if (dx * dx + dy * dy < 18 * 18) return n.id
    }
    return null
  }

  function bgUp(e: PointerEvent) {
    panning = false
    if (linkingFrom) {
      const target = hitInPort(e.clientX, e.clientY)
      if (target) onConnect(linkingFrom, target)
      linkingFrom = null
      draftPos = null
    }
  }

  function onPortDown(id: string, side: 'in' | 'out', e: PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (side === 'out') {
      linkingFrom = id
      draftPos = worldFromClient(e.clientX, e.clientY)
      surfaceEl?.setPointerCapture(e.pointerId)
      return
    }
    if (linkingFrom) {
      onConnect(linkingFrom, id)
      linkingFrom = null
      draftPos = null
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="relative h-full w-full cursor-default touch-none overflow-hidden bg-bg bg-[length:14px_14px] bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)]"
  bind:this={surfaceEl}
  onwheel={onWheel}
  onpointerdown={bgDown}
  onpointermove={bgMove}
  onpointerup={bgUp}
  onpointercancel={bgUp}
  oncontextmenu={onCtx}
  role="application"
  aria-label="Patch bay"
>
  <div
    class="surface absolute inset-0 h-[3000px] w-[4000px] origin-top-left"
    style:transform="translate({panX}px, {panY}px) scale({scale})"
  >
    <svg class="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
      {#each edges as edge (edge.id)}
        {@const a = nodes.find((n) => n.id === edge.from)}
        {@const b = nodes.find((n) => n.id === edge.to)}
        {#if a && b}
          {@const p1 = portCenter(a, 'out')}
          {@const p2 = portCenter(b, 'in')}
          <path
            d={cablePath(p1.x, p1.y, p2.x, p2.y)}
            stroke="#5a5a5a"
            fill="none"
            stroke-width="1"
            stroke-linecap="square"
          />
        {/if}
      {/each}
      {#if linkingFrom && draftPos}
        {@const a = nodes.find((n) => n.id === linkingFrom)}
        {#if a}
          {@const p1 = portCenter(a, 'out')}
          <path
            d={cablePath(p1.x, p1.y, draftPos.x, draftPos.y)}
            stroke="#5a5a5a"
            fill="none"
            stroke-width="1"
            stroke-linecap="square"
            stroke-dasharray="4 3"
          />
        {/if}
      {/if}
    </svg>

    {#each nodes as node, i (node.id)}
      <Module
        bind:node={nodes[i]}
        selected={selectedId === node.id}
        clientToWorld={worldFromClient}
        onSelect={onSelect}
        onRemove={onRemove}
        onMove={onMove}
        onParam={onParam}
        onToggle={onToggle}
        onPortDown={onPortDown}
      />
    {/each}
  </div>
</div>

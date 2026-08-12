<script lang="ts">
  import { NODE_TYPES, type GraphNode, type FieldDef } from '../lib/types'

  interface Props {
    node: GraphNode
    selected?: boolean
    clientToWorld: (clientX: number, clientY: number) => { x: number; y: number }
    onSelect?: (id: string) => void
    onRemove?: (id: string) => void
    onMove?: (id: string, x: number, y: number) => void
    onParam?: (id: string, key: string, value: string | number) => void
    onToggle?: (id: string) => void
    onPortDown?: (id: string, side: 'in' | 'out', event: PointerEvent) => void
  }

  let {
    node,
    selected = false,
    clientToWorld,
    onSelect,
    onRemove,
    onMove,
    onParam,
    onToggle,
    onPortDown,
  }: Props = $props()

  const def = $derived(NODE_TYPES[node.kind])

  let dragging = $state(false)
  let ox = 0
  let oy = 0

  function startDrag(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('.port, input, select, button')) return
    dragging = true
    const w = clientToWorld(e.clientX, e.clientY)
    ox = w.x - node.x
    oy = w.y - node.y
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onSelect?.(node.id)
  }

  function onMovePtr(e: PointerEvent) {
    if (!dragging) return
    const w = clientToWorld(e.clientX, e.clientY)
    onMove?.(node.id, w.x - ox, w.y - oy)
  }

  function endDrag() {
    dragging = false
  }

  function setField(f: FieldDef, raw: string) {
    const v = f.type === 'number' ? Number(raw) : raw
    onParam?.(node.id, f.key, v)
  }
</script>

<div
  data-module
  class="absolute z-[2] w-[200px] cursor-grab select-none border border-border bg-panel text-fg active:cursor-grabbing {selected
    ? 'border-border-strong'
    : ''} {!node.on ? 'opacity-40' : ''}"
  style:left="{node.x}px"
  style:top="{node.y}px"
  onpointerdown={startDrag}
  onpointermove={onMovePtr}
  onpointerup={endDrag}
  onpointercancel={endDrag}
  role="group"
  aria-label={def.title}
>
  <header class="grid grid-cols-[10px_1fr_auto] items-center gap-1.5 border-b border-border-soft bg-panel-2 px-1.5 py-1">
    <button
      class="size-[7px] cursor-pointer border border-port bg-bg p-0 {node.on
        ? 'border-fg bg-fg'
        : ''}"
      type="button"
      aria-label={node.on ? 'Turn off' : 'Turn on'}
      aria-pressed={node.on}
      onclick={(e) => {
        e.stopPropagation()
        onToggle?.(node.id)
      }}
      onpointerdown={(e) => e.stopPropagation()}
    ></button>
    <h3 class="m-0 text-[11px] font-normal text-fg">{def.title}</h3>
    <button
      class="cursor-pointer border-0 bg-transparent p-0 text-xs leading-none text-muted hover:text-fg"
      type="button"
      onclick={() => onRemove?.(node.id)}
      aria-label="Remove"
    >
      ×
    </button>
  </header>

  <div class="relative min-h-14 px-3.5 py-2">
    {#if def.inputs}
      <button
        class="port absolute top-1/2 -left-1 mt-[-4px] size-[7px] cursor-crosshair border border-port bg-bg p-0"
        type="button"
        aria-label="input"
        onpointerdown={(e) => {
          e.stopPropagation()
          onPortDown?.(node.id, 'in', e)
        }}
      ></button>
    {/if}

    <div class="flex flex-col gap-1">
      {#each def.fields as f (f.key)}
        <label class="grid grid-cols-[32px_1fr_auto] items-center gap-1 text-[10px] text-muted">
          <span>{f.label}</span>
          {#if f.type === 'select'}
            <select
              class="col-span-2 w-full border border-border bg-bg px-1 py-0.5 text-fg"
              value={String(node.params[f.key] ?? f.default)}
              onchange={(e) => setField(f, e.currentTarget.value)}
            >
              {#each f.options ?? [] as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          {:else if f.type === 'number'}
            <input
              class="w-full accent-muted"
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={Number(node.params[f.key] ?? f.default)}
              oninput={(e) => setField(f, e.currentTarget.value)}
            />
            <em class="min-w-[2.2em] text-right not-italic text-muted-2">{node.params[f.key]}</em>
          {:else}
            <input
              class="col-span-2 w-full border border-border bg-bg px-1 py-0.5 text-fg"
              type="text"
              spellcheck="false"
              value={String(node.params[f.key] ?? f.default)}
              oninput={(e) => setField(f, e.currentTarget.value)}
            />
          {/if}
        </label>
      {/each}
    </div>

    {#if def.outputs}
      <button
        class="port absolute top-1/2 -right-1 mt-[-4px] size-[7px] cursor-crosshair border border-port bg-port p-0"
        type="button"
        aria-label="output"
        onpointerdown={(e) => {
          e.stopPropagation()
          onPortDown?.(node.id, 'out', e)
        }}
      ></button>
    {/if}
  </div>
</div>

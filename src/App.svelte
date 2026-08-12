<script lang="ts">
  import Canvas from './lib/Canvas.svelte'
  import Knob from './lib/Knob.svelte'
  import { addNode, compileGraph, connect, defaultPatch, removeNode, type PatchGraph } from './lib/graph'
  import { ensureStrudel, playCode, stopAudio } from './lib/strudel'
  import { PALETTE, NODE_TYPES, type NodeKind } from './lib/types'

  let graph = $state<PatchGraph>(defaultPatch())
  let selectedId = $state<string | null>(null)
  let playing = $state(false)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let bpm = $state(120)
  let code = $derived(compileGraph(graph).code)
  // setcpm takes cycles/min; bpm/4 ≈ 4/4 quarters
  let playable = $derived(code ? `setcpm(${bpm}/4)\n${code}` : '')

  let menu = $state<{ open: boolean; x: number; y: number; worldX: number; worldY: number }>({
    open: false,
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
  })

  async function togglePlay() {
    error = null
    busy = true
    closeMenu()
    try {
      await ensureStrudel()
      if (playing) {
        stopAudio()
        playing = false
      } else {
        if (!playable) throw new Error('turn on a SOUND module')
        await playCode(playable)
        playing = true
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      playing = false
    } finally {
      busy = false
    }
  }

  async function hotReload() {
    if (!playing) return
    try {
      await playCode(playable)
      error = null
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  $effect(() => {
    void playable
    if (playing) {
      const t = setTimeout(() => {
        void hotReload()
      }, 120)
      return () => clearTimeout(t)
    }
  })

  function closeMenu() {
    menu = { ...menu, open: false }
  }

  function openMenu(clientX: number, clientY: number, worldX: number, worldY: number) {
    const pad = 8
    const mw = 180
    const mh = 40 + PALETTE.length * 34
    const x = Math.min(clientX, window.innerWidth - mw - pad)
    const y = Math.min(clientY, window.innerHeight - mh - pad)
    menu = { open: true, x: Math.max(pad, x), y: Math.max(pad, y), worldX, worldY }
  }

  function spawn(kind: NodeKind) {
    const node = addNode(graph, kind, menu.worldX - 94, menu.worldY - 40)
    graph = { nodes: [...graph.nodes], edges: [...graph.edges] }
    selectedId = node.id
    closeMenu()
  }

  function onRemove(id: string) {
    removeNode(graph, id)
    graph = { nodes: [...graph.nodes], edges: [...graph.edges] }
    if (selectedId === id) selectedId = null
  }

  function onMove(id: string, x: number, y: number) {
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    }
  }

  function onParam(id: string, key: string, value: string | number) {
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n,
      ),
    }
  }

  function onToggle(id: string) {
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === id ? { ...n, on: !n.on } : n)),
    }
  }

  function onConnect(from: string, to: string) {
    const err = connect(graph, from, to)
    if (err) {
      error = err
      return
    }
    graph = { nodes: [...graph.nodes], edges: [...graph.edges] }
    error = null
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') closeMenu()
  }}
  onclick={closeMenu}
/>

<div class="relative h-screen w-screen overflow-hidden bg-bg text-fg">
  <Canvas
    nodes={graph.nodes}
    edges={graph.edges}
    {selectedId}
    onSelect={(id) => {
      closeMenu()
      selectedId = id
    }}
    {onRemove}
    {onMove}
    {onParam}
    {onToggle}
    {onConnect}
    onContextMenu={openMenu}
  />

  <div class="pointer-events-none absolute top-2 left-2 z-[5] flex items-start gap-2">
    <div class="flex flex-col gap-1.5">
      <button
        class="pointer-events-auto cursor-pointer border border-border bg-panel px-2.5 py-1 text-[11px] text-fg disabled:cursor-wait disabled:opacity-50 {playing
          ? 'border-border-strong text-fg-bright'
          : ''}"
        type="button"
        disabled={busy}
        onclick={togglePlay}
      >
        {playing ? 'stop' : 'play'}
      </button>
      {#if error}
        <p class="pointer-events-auto m-0 max-w-[280px] border border-border bg-panel px-1.5 py-1 text-[11px] leading-snug text-muted-2">
          {error}
        </p>
      {/if}
    </div>
    <Knob value={bpm} onChange={(v) => (bpm = v)} />
  </div>

  {#if menu.open}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="fixed z-20 min-w-[140px] border border-border bg-panel p-0.5"
      style:left="{menu.x}px"
      style:top="{menu.y}px"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onpointerdown={(e) => e.stopPropagation()}
      role="menu"
    >
      <p class="mx-1.5 mt-1 mb-0.5 text-[10px] text-muted">add module</p>
      {#each PALETTE as kind}
        <button
          class="flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1.5 py-1 text-left text-[11px] text-fg hover:bg-panel-2"
          type="button"
          role="menuitem"
          onclick={() => spawn(kind)}
        >
          <i class="inline-block size-[7px] bg-muted"></i>
          {NODE_TYPES[kind].title}
        </button>
      {/each}
    </div>
  {/if}
</div>

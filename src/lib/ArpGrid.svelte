<script lang="ts">
  import {
    LANES,
    LANE_BY_KEY,
    MAX_STEPS,
    RATES,
    SHAPE_BASE,
    SHAPES,
    laneIndex,
    laneWrapBars,
    selectArpPattern,
    stepAtCycle,
    stepsPerCycle,
    type ArpData,
    type LaneKey,
  } from './chord-engine'
  import { deleteArpPreset, listArpPresets, loadArpPreset, saveArpPreset } from './arp-presets'
  import { clock, watchClock } from './transport.svelte'

  interface Props {
    arp: ArpData
    /** module is switched on, so its playhead is worth showing */
    live?: boolean
  }

  let { arp = $bindable(), live = true }: Props = $props()

  $effect(watchClock)

  /** short codes so a shape still reads in a 30px column */
  const SHAPE_CODES = ['up', 'dn', 'ud', 'du', 'UD', 'DU', 'fl', 'fh']
  const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  const tab = $derived(arp.tab)
  const def = $derived(LANE_BY_KEY[tab])
  const len = $derived(Math.max(1, arp.len[tab]))
  const levels = $derived(Math.round((def.max - def.min) / def.step) + 1)

  const step = $derived(live && clock.running ? stepAtCycle(arp, clock.cycle) : -1)
  /** playhead of the lane on screen, which drifts against the others when its ÷ differs */
  const playing = $derived(step < 0 ? -1 : laneIndex(arp, tab, step))
  const playingNote = $derived(step < 0 ? -1 : laneIndex(arp, 'note', step))

  const wrap = $derived(laneWrapBars(arp, tab))
  const fit = $derived(
    arp.retrig
      ? `${stepsPerCycle(arp.rate)}/bar · retrigger armed`
      : wrap === 1
        ? `${stepsPerCycle(arp.rate)} steps/bar`
        : `${stepsPerCycle(arp.rate)}/bar · lane comes round every ${wrap} bars`,
  )

  let gridEl: HTMLElement | undefined = $state()
  let hovered = $state<number | null>(null)
  let presetNames = $state<string[]>([])
  let selectedPreset = $state('')

  function refreshPresets() {
    presetNames = listArpPresets()
  }

  function savePreset() {
    const name = window.prompt('Preset name', selectedPreset || 'My arp')?.trim()
    if (!name) return
    saveArpPreset(name, arp)
    selectedPreset = name
    refreshPresets()
  }

  function loadPreset(name: string) {
    const loaded = loadArpPreset(name)
    if (!loaded) return
    Object.assign(arp, loaded)
    selectedPreset = name
  }

  function renamePattern(index: number) {
    const name = window.prompt('Pattern name', arp.patternNames[index])?.trim()
    if (name) arp.patternNames[index] = name
  }

  $effect(() => {
    refreshPresets()
  })

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  function level(value: number): number {
    return clamp(Math.round((value - def.min) / def.step), 0, levels - 1)
  }

  function heightOf(value: number): number {
    return (level(value) / (levels - 1)) * 100
  }

  function cellText(key: LaneKey, value: number): string {
    if (key === 'note') {
      if (value <= 0) return ''
      return value < SHAPE_BASE ? String(value) : SHAPE_CODES[value - SHAPE_BASE]
    }
    if (key === 'late') return value ? String(value) : ''
    if (def.step < 1) return value === def.center ? '' : String(Math.round(value * 10) / 10)
    return value ? String(value) : ''
  }

  function longText(key: LaneKey, value: number): string {
    if (key !== 'note') return String(Math.round(value * 100) / 100)
    if (value <= 0) return 'off'
    return value < SHAPE_BASE ? `voice ${value}` : SHAPES[value - SHAPE_BASE]
  }

  function stepAt(clientX: number): number {
    const r = gridEl!.getBoundingClientRect()
    return clamp(Math.floor(((clientX - r.left) / r.width) * len), 0, len - 1)
  }

  function paint(clientX: number, clientY: number) {
    const r = gridEl!.getBoundingClientRect()
    const frac = 1 - (clientY - r.top) / r.height
    const lvl = Math.round(clamp(frac, 0, 1) * (levels - 1))
    arp.lanes[tab][stepAt(clientX)] = Math.round((def.min + lvl * def.step) * 1000) / 1000
  }

  function onGridDown(e: PointerEvent) {
    e.preventDefault()
    const step = stepAt(e.clientX)
    if (tab === 'note' && (e.altKey || e.shiftKey)) {
      if (e.altKey) arp.reset[step] = !arp.reset[step]
      else arp.tie[step] = !arp.tie[step]
      return
    }
    gridEl!.setPointerCapture(e.pointerId)
    paint(e.clientX, e.clientY)
    const move = (ev: PointerEvent) => paint(ev.clientX, ev.clientY)
    const stop = () => {
      gridEl!.removeEventListener('pointermove', move)
      gridEl!.removeEventListener('pointerup', stop)
      gridEl!.removeEventListener('pointercancel', stop)
    }
    gridEl!.addEventListener('pointermove', move)
    gridEl!.addEventListener('pointerup', stop)
    gridEl!.addEventListener('pointercancel', stop)
  }

  function setLen(value: number) {
    const next = clamp(Math.round(value), 1, MAX_STEPS)
    if (arp.linkLen) for (const l of LANES) arp.len[l.key] = next
    else arp.len[tab] = next
  }

  function clearLane() {
    for (let i = 0; i < MAX_STEPS; i++) arp.lanes[tab][i] = def.center
    if (tab === 'note') {
      for (let i = 0; i < MAX_STEPS; i++) {
        arp.tie[i] = false
        arp.reset[i] = false
      }
    }
  }

  function randomLane() {
    for (let i = 0; i < len; i++) {
      if (tab === 'note') {
        const roll = Math.random()
        arp.lanes.note[i] = roll < 0.15 ? 0 : roll < 0.75 ? 1 + Math.floor(Math.random() * 6) : SHAPE_BASE + Math.floor(Math.random() * 8)
      } else if (Math.random() < 0.4) {
        const lvl = Math.floor(Math.random() * levels)
        arp.lanes[tab][i] = Math.round((def.min + lvl * def.step) * 1000) / 1000
      } else {
        arp.lanes[tab][i] = def.center
      }
    }
  }

  function cycleStep(i: number, e: MouseEvent) {
    if (e.altKey) arp.reset[i] = !arp.reset[i]
    else if (e.shiftKey) arp.tie[i] = !arp.tie[i]
    else arp.mute[i] = !arp.mute[i]
  }
</script>

<div class="mt-2 flex flex-col gap-1.5" data-nodrag>
  <div class="flex gap-[2px] border-b border-border-soft pb-1">
    {#each Array(12) as _, i}
      <button
        class="min-w-0 flex-1 truncate border px-1 py-[1px] text-[8px] {arp.pattern === i
          ? 'border-border-strong text-fg-bright'
          : 'border-border-soft text-muted'}"
        type="button"
        title="{arp.patternNames[i]} · shift-click copies current pattern · double-click renames"
        onclick={(e) => selectArpPattern(arp, i, e.shiftKey)}
        ondblclick={() => renamePattern(i)}
      >
        {String.fromCharCode(65 + i)}
      </button>
    {/each}
  </div>
  <div class="flex flex-wrap items-center gap-[3px]">
    {#each LANES as l}
      <button
        class="border px-1 py-[1px] text-[9px] {tab === l.key
          ? 'border-border-strong text-fg-bright'
          : 'border-border-soft text-muted hover:text-fg'}"
        type="button"
        onclick={() => (arp.tab = l.key)}
      >
        {l.label}
      </button>
    {/each}
    <span class="ml-auto text-[9px] text-muted">
      {hovered != null ? `step ${hovered + 1} · ${longText(tab, arp.lanes[tab][hovered] ?? def.center)}` : fit}
    </span>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative flex h-[92px] cursor-crosshair border border-border-soft bg-bg"
    bind:this={gridEl}
    onpointerdown={onGridDown}
    onpointermove={(e) => (hovered = stepAt(e.clientX))}
    onpointerleave={() => (hovered = null)}
  >
    {#if tab === 'note'}
      <i class="pointer-events-none absolute inset-x-0 bg-border-soft" style:top="47%" style:height="1px"></i>
    {:else if def.min < 0}
      <i class="pointer-events-none absolute inset-x-0 top-1/2 bg-border-soft" style:height="1px"></i>
    {/if}
    {#each Array(len) as _, i}
      {@const value = arp.lanes[tab][i] ?? def.center}
      <div
        class="relative flex-1 border-r border-border-soft/40 last:border-r-0 {arp.mute[i] && tab === 'note'
          ? 'opacity-30'
          : ''} {playing === i ? 'bg-fg/10' : hovered === i ? 'bg-panel-2' : ''}"
      >
        {#if tab === 'note'}
          {#if value > 0}
            <i
              class="pointer-events-none absolute inset-x-[2px] {playing === i
                ? 'bg-fg-bright'
                : value >= SHAPE_BASE
                  ? 'bg-muted-2'
                  : 'bg-muted'}"
              style:bottom="calc({heightOf(value)}% - 5px)"
              style:height="5px"
            ></i>
            {#if value < SHAPE_BASE}
              <i class="pointer-events-none absolute inset-x-[6px] bottom-0 bg-border" style:height="{heightOf(value)}%"></i>
            {/if}
          {/if}
        {:else}
          <i
            class="pointer-events-none absolute inset-x-[2px] {playing === i ? 'bg-fg-bright' : 'bg-muted'}"
            style:bottom={def.min < 0 ? '50%' : '0'}
            style:height="{def.min < 0 ? Math.abs(heightOf(value) - 50) : heightOf(value)}%"
            style:transform={def.min < 0 && value < def.center ? 'translateY(100%)' : 'none'}
          ></i>
        {/if}
        {#if arp.reset[i] && tab === 'note'}
          <span class="pointer-events-none absolute top-0 left-0 text-[8px] text-fg-bright">↺</span>
        {/if}
        {#if arp.tie[i] && tab === 'note'}
          <span class="pointer-events-none absolute top-0 right-0 text-[8px] text-fg-bright">~</span>
        {/if}
      </div>
    {/each}
  </div>

  {#if len <= 16}
    <div class="flex text-[8px] text-muted">
      {#each Array(len) as _, i}
        <span class="flex-1 text-center {playing === i ? 'text-fg-bright' : ''}">
          {cellText(tab, arp.lanes[tab][i] ?? def.center)}
        </span>
      {/each}
    </div>
  {/if}

  {#if tab === 'note'}
    <div class="flex gap-[2px]">
      {#each Array(len) as _, i}
        <button
          class="h-3 flex-1 border text-[7px] leading-none {playingNote === i
            ? 'border-border-strong bg-fg/20 text-fg-bright'
            : arp.mute[i]
              ? 'border-border-soft bg-bg text-muted'
              : 'border-border bg-panel-2 text-muted-2'}"
          type="button"
          title="click mutes · shift = tie · alt = position reset"
          onclick={(e) => cycleStep(i, e)}
        >
          {arp.reset[i] ? '↺' : arp.tie[i] ? '~' : ''}
        </button>
      {/each}
    </div>
  {/if}

  {#if tab === 'pitch'}
    <div class="flex items-center gap-1.5 text-[9px] text-muted">
      <span>degrees</span>
      {#each arp.degrees as on, d}
        <button
          class="border px-1 {on ? 'border-border-strong text-fg-bright' : 'border-border-soft text-muted'}"
          type="button"
          onclick={() => (arp.degrees[d] = !arp.degrees[d])}
        >
          {d + 1}
        </button>
      {/each}
      <span class="text-muted">only these chord degrees transpose</span>
    </div>
    <div class="flex items-center gap-1.5 text-[9px] text-muted">
      <span>allow</span>
      <div class="flex gap-[2px]">
        {#each Array(12) as _, pc}
          <button
            class="w-5 border text-[8px] {arp.prevent[pc] === 0
              ? 'border-border-soft text-muted'
              : 'border-border-strong text-fg-bright'}"
            type="button"
            title="click cycles: allow → block → nudge up → nudge down"
            onclick={() => (arp.prevent[pc] = (arp.prevent[pc] + 1) % 4)}
          >
            {['', '×', '↑', '↓'][arp.prevent[pc]] || PC_NAMES[pc]}
          </button>
        {/each}
      </div>
      <span class="text-muted">block out-of-key notes</span>
    </div>
  {/if}

  <div class="flex items-center gap-2 border-t border-border-soft pt-1.5 text-[9px] text-muted">
    <label class="flex items-center gap-1">
      <span>rate</span>
      <select class="border border-border bg-bg px-1 text-fg" bind:value={arp.rate}>
        {#each RATES as r}
          <option value={r.value}>{r.label}</option>
        {/each}
      </select>
    </label>
    <label class="flex items-center gap-1">
      <span>len</span>
      <input
        class="w-16 accent-muted"
        type="range"
        min="1"
        max={MAX_STEPS}
        step="1"
        value={len}
        oninput={(e) => setLen(Number(e.currentTarget.value))}
      />
      <em class="not-italic text-muted-2">{len}</em>
    </label>
    <label class="flex items-center gap-1">
      <span>÷</span>
      <input
        class="w-10 accent-muted"
        type="range"
        min="1"
        max="8"
        step="1"
        value={arp.div[tab]}
        oninput={(e) => (arp.div[tab] = Number(e.currentTarget.value))}
      />
      <em class="not-italic text-muted-2">{arp.div[tab]}</em>
    </label>
    <button
      class="border px-1 {arp.linkLen ? 'border-border-strong text-fg-bright' : 'border-border-soft text-muted'}"
      type="button"
      onclick={() => {
        arp.linkLen = !arp.linkLen
        if (arp.linkLen) setLen(len)
      }}
    >
      link
    </button>
    <button
      class="border px-1 {arp.retrig ? 'border-border-strong text-fg-bright' : 'border-border-soft text-muted'}"
      type="button"
      title="restart at step 1 on every chord — off, lanes run free across the bar line"
      onclick={() => (arp.retrig = !arp.retrig)}
    >
      retrig
    </button>
    <button
      class="border px-1 {arp.chordMode ? 'border-border-strong text-fg-bright' : 'border-border-soft text-muted'}"
      type="button"
      title="also sound the rest of the chord above the arp note"
      onclick={() => (arp.chordMode = !arp.chordMode)}
    >
      chord
    </button>
    <button class="ml-auto border border-border-soft px-1 hover:text-fg" type="button" onclick={randomLane}>
      rand
    </button>
    <button class="border border-border-soft px-1 hover:text-fg" type="button" onclick={clearLane}>clr</button>
  </div>
  <div class="grid grid-cols-2 gap-2 text-[9px] text-muted">
    <label class="grid grid-cols-[34px_1fr_auto] items-center gap-1">
      <span>swing</span>
      <input class="min-w-0 accent-muted" type="range" min="-0.45" max="0.45" step="0.05" bind:value={arp.swing} />
      <em class="not-italic text-muted-2">{Math.round(arp.swing * 100)}%</em>
    </label>
    <label class="grid grid-cols-[30px_1fr_auto] items-center gap-1">
      <span>gate</span>
      <input class="min-w-0 accent-muted" type="range" min="0.1" max="2" step="0.05" bind:value={arp.globalGate} />
      <em class="not-italic text-muted-2">{Math.round(arp.globalGate * 100)}%</em>
    </label>
  </div>
  <div class="flex items-center gap-1 border-t border-border-soft pt-1.5 text-[9px] text-muted">
    <select
      class="min-w-0 flex-1 border border-border bg-bg px-1 text-fg"
      value={selectedPreset}
      onchange={(e) => loadPreset(e.currentTarget.value)}
    >
      <option value="">saved presets</option>
      {#each presetNames as preset}<option value={preset}>{preset}</option>{/each}
    </select>
    <button class="border border-border-soft px-1 hover:text-fg" type="button" onclick={savePreset}>save</button>
    <button
      class="border border-border-soft px-1 hover:text-fg disabled:opacity-30"
      type="button"
      disabled={!selectedPreset}
      onclick={() => {
        deleteArpPreset(selectedPreset)
        selectedPreset = ''
        refreshPresets()
      }}
    >
      del
    </button>
  </div>
</div>

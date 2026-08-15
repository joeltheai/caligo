<script lang="ts">
  import { Chord } from '@tonaljs/tonal'
  import {
    CHORD_BANKS,
    CHORD_QUALITY_OPTIONS,
    ALL_CHORD_QUALITY_OPTIONS,
    ALL_SCALE_OPTIONS,
    PADS,
    PAD_KEYS,
    SCALE_OPTIONS,
    TONICS,
    VOICES,
    applyChordBank,
    bakeChordMapping,
    heldNotes,
    padForKey,
    padForMidi,
    prettyName,
    progSlotAtCycle,
    type ChordData,
    type ChordSlot,
  } from './chord-engine'
  import {
    deleteChordPreset,
    listChordPresets,
    loadChordPreset,
    saveChordPreset,
  } from './chord-presets'
  import { enableMidi, onMidiNote } from './midi'
  import { transportCycle } from './strudel'
  import { clock, watchClock } from './transport.svelte'

  interface Props {
    chord: ChordData
    /** module is switched on, so its playhead is worth showing */
    live?: boolean
  }

  let { chord = $bindable(), live = true }: Props = $props()

  let midiError = $state<string | null>(null)
  let learning = $state(false)
  let presetNames = $state<string[]>([])
  let selectedPreset = $state('')
  let copied: ChordSlot | null = $state(null)
  const learnHeld = new Map<number, number>()
  const learnChord = new Map<number, number>()
  const performanceHeld = new Map<number, { velocity: number; order: number }>()
  let pressOrder = 0

  $effect(watchClock)

  const playingSlot = $derived(live && clock.running ? progSlotAtCycle(chord, clock.cycle) : -1)
  const playingPad = $derived(
    !live || !clock.running ? -1 : playingSlot < 0 ? chord.current : (chord.prog[playingSlot] ?? -1),
  )

  function name(pad: number): string {
    const notes = heldNotes(chord, pad).notes
    if (!notes.length) return '—'
    try {
      const detected = Chord.detect(notes.map((n) => prettyName(n).toUpperCase()))
      if (detected.length) return detected[0].replace('M', 'maj')
    } catch {
      // unnameable stack of notes — fall through to the bass note
    }
    return `${prettyName(notes[0]).toUpperCase()}…`
  }

  function drag(e: PointerEvent, apply: (up: number) => void) {
    const el = e.currentTarget as HTMLElement
    const startY = e.clientY
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => apply(startY - ev.clientY)
    const stop = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', stop)
      el.removeEventListener('pointercancel', stop)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', stop)
    el.addEventListener('pointercancel', stop)
  }

  function dragVoice(e: PointerEvent, v: number) {
    const slot = chord.slots[chord.selected]
    const base = slot.voices[v] ?? 47
    drag(e, (up) => {
      const next = base + Math.round(up / 6)
      slot.voices[v] = next < 24 ? null : Math.min(96, next)
    })
  }

  function dragVel(e: PointerEvent, v: number) {
    const slot = chord.slots[chord.selected]
    const base = slot.vel[v] ?? 1
    drag(e, (up) => {
      slot.vel[v] = Math.max(0, Math.min(2, Math.round((base + up / 30) * 20) / 20))
    })
  }

  function toggleLock(v: number) {
    chord.lock[v] = !chord.lock[v]
    chord.lockVal[v] = chord.lock[v] ? chord.slots[chord.selected].voices[v] : null
  }

  function setProg(i: number, e: MouseEvent) {
    chord.prog[i] = e.altKey || e.shiftKey ? -1 : chord.selected
  }

  function randomizePad() {
    const slot = chord.slots[chord.selected]
    const root = 36 + Math.floor(Math.random() * 12)
    const shape = [
      [0, 3, 7, 10],
      [0, 4, 7, 11],
      [0, 5, 7, 12],
      [0, 3, 7, 10, 14],
      [0, 4, 7, 14],
      [0, 3, 6, 10],
    ][Math.floor(Math.random() * 6)]
    for (let v = 0; v < VOICES; v++) {
      if (chord.lock[v]) continue
      slot.voices[v] = shape[v] == null ? null : root + shape[v]
    }
  }

  function trigger(note: number, velocity = 1) {
    const pad = padForMidi(note)
    chord.selected = pad
    chord.current = pad
    chord.page = Math.floor(pad / PADS) * PADS
    chord.triggerVelocity = Math.max(0, Math.min(1, velocity))
    chord.triggerSerial += 1
    chord.triggerCycle = transportCycle() ?? 0
  }

  function press(note: number, velocity = 1) {
    performanceHeld.set(note, { velocity, order: ++pressOrder })
    trigger(note, velocity)
  }

  function release(note: number) {
    performanceHeld.delete(note)
    if (chord.latch || chord.current !== padForMidi(note)) return
    const previous = [...performanceHeld.entries()].sort((a, b) => b[1].order - a[1].order)[0]
    if (previous) trigger(previous[0], previous[1].velocity)
    else chord.current = -1
  }

  function finishLearn() {
    if (!learnChord.size) return
    const entries = [...learnChord.entries()].sort((a, b) => a[0] - b[0]).slice(0, VOICES)
    const target = chord.slots[chord.selected]
    for (let v = 0; v < VOICES; v++) {
      target.voices[v] = entries[v]?.[0] ?? null
      target.vel[v] = entries[v]?.[1] ?? 1
    }
    chord.selected = Math.min(127, chord.selected + 1)
    chord.page = Math.floor(chord.selected / PADS) * PADS
    learnChord.clear()
  }

  function copySlot() {
    copied = structuredClone(chord.slots[chord.selected])
  }

  function pasteSlot() {
    if (copied) chord.slots[chord.selected] = structuredClone(copied)
  }

  function clearSlot() {
    chord.slots[chord.selected] = {
      voices: Array.from({ length: VOICES }, () => null),
      vel: Array.from({ length: VOICES }, () => 1),
    }
  }

  function refreshPresets() {
    presetNames = listChordPresets()
  }

  function savePreset() {
    const name = window.prompt('Preset name', selectedPreset || 'My chords')?.trim()
    if (!name) return
    saveChordPreset(name, chord)
    selectedPreset = name
    refreshPresets()
  }

  function loadPreset(name: string) {
    const loaded = loadChordPreset(name)
    if (!loaded) return
    Object.assign(chord, loaded)
    selectedPreset = name
  }

  const held = $derived(heldNotes(chord, chord.current >= 0 ? chord.current : chord.selected))
  const generated = $derived(heldNotes(chord, chord.selected))

  $effect(() => {
    refreshPresets()
  })

  $effect(() => {
    if (!chord.keys) return
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && target.closest('input, select, textarea')) return
      const pad = padForKey(e.key)
      if (pad >= 0 && !e.repeat) {
        press(chord.page + pad)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      const pad = padForKey(e.key)
      if (pad >= 0) release(chord.page + pad)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  $effect(() => {
    if (!chord.midi) {
      midiError = null
      return
    }
    let live = true
    void enableMidi().then((err) => {
      if (live) midiError = err
    })
    const off = onMidiNote((event) => {
      if (learning) {
        if (event.type === 'noteon') {
          learnHeld.set(event.note, event.velocity)
          learnChord.set(event.note, event.velocity)
        } else {
          learnHeld.delete(event.note)
          if (!learnHeld.size) finishLearn()
        }
        return
      }
      if (event.type === 'noteon') press(event.note, event.velocity)
      else release(event.note)
    })
    return () => {
      live = false
      off()
    }
  })
</script>

<div class="mt-2 flex flex-col gap-2" data-nodrag>
  <div class="grid grid-cols-2 gap-1 border-b border-border-soft pb-1.5 text-[9px] text-muted">
    <label class="flex items-center gap-1">
      <span>map</span>
      <select class="min-w-0 flex-1 border border-border bg-bg px-1 text-fg" bind:value={chord.mappingMode}>
        <option value="memory">memory slots</option>
        <option value="degree">scale degrees</option>
        <option value="root-quality">root + quality</option>
      </select>
    </label>
    {#if chord.mappingMode === 'degree'}
      <label class="flex items-center gap-1">
        <span>scale</span>
        <select class="min-w-0 flex-1 border border-border bg-bg px-1 text-fg" bind:value={chord.scaleType}>
          <optgroup label="common">
            {#each SCALE_OPTIONS as scale}<option value={scale}>{scale}</option>{/each}
          </optgroup>
          <optgroup label="all scale types">
            {#each ALL_SCALE_OPTIONS as scale}<option value={scale}>{scale}</option>{/each}
          </optgroup>
        </select>
      </label>
      <label class="flex items-center gap-1">
        <span>tonic</span>
        <select class="min-w-0 flex-1 border border-border bg-bg px-1 text-fg" bind:value={chord.tonic}>
          {#each TONICS as tonic}<option value={tonic}>{tonic}</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-1">
        <span>voices</span>
        <input class="min-w-0 flex-1 accent-muted" type="range" min="2" max="7" step="1" bind:value={chord.chordSize} />
        <em class="not-italic text-muted-2">{chord.chordSize}</em>
      </label>
      <label class="col-span-2 flex items-center gap-1">
        <span>outside</span>
        <select class="min-w-0 flex-1 border border-border bg-bg px-1 text-fg" bind:value={chord.scaleSnap}>
          <option value="silence">silence</option>
          <option value="nearest">nearest scale note</option>
          <option value="up">snap up</option>
          <option value="down">snap down</option>
        </select>
      </label>
    {:else if chord.mappingMode === 'root-quality'}
      <label class="flex items-center gap-1">
        <span>quality</span>
        <select class="min-w-0 flex-1 border border-border bg-bg px-1 text-fg" bind:value={chord.chordQuality}>
          <optgroup label="common">
            {#each CHORD_QUALITY_OPTIONS as quality}<option value={quality.value}>{quality.label}</option>{/each}
          </optgroup>
          <optgroup label="all chord types">
            {#each ALL_CHORD_QUALITY_OPTIONS as quality}<option value={quality.value}>{quality.label}</option>{/each}
          </optgroup>
        </select>
      </label>
    {:else}
      <label class="flex items-center gap-1">
        <span>bank</span>
        <select
          class="min-w-0 flex-1 border border-border bg-bg px-1 text-fg"
          value={chord.bank}
          onchange={(e) => applyChordBank(chord, e.currentTarget.value as typeof chord.bank)}
        >
          {#each CHORD_BANKS as bank}<option value={bank.id}>{bank.label}</option>{/each}
        </select>
      </label>
    {/if}
    {#if chord.mappingMode !== 'memory'}
      <label class="flex items-center gap-1">
        <span>voicing</span>
        <select class="min-w-0 flex-1 border border-border bg-bg px-1 text-fg" bind:value={chord.voicing}>
          <option value="close">close</option>
          <option value="open">open</option>
        </select>
      </label>
      <label class="flex items-center gap-1">
        <span>inv</span>
        <input class="min-w-0 flex-1 accent-muted" type="range" min="0" max="3" step="1" bind:value={chord.inversion} />
        <em class="not-italic text-muted-2">{chord.inversion}</em>
      </label>
      <button
        class="border border-border-soft px-1 text-left text-[8px] text-muted hover:text-fg"
        type="button"
        title="convert this generated mapping into 128 editable memory slots"
        onclick={() => bakeChordMapping(chord)}
      >
        bake to memory
      </button>
    {/if}
  </div>

  <div class="flex items-center gap-1 text-[9px] text-muted">
    <button
      class="border border-border-soft px-1 hover:text-fg disabled:opacity-30"
      type="button"
      disabled={chord.page <= 0}
      onclick={() => (chord.page = Math.max(0, chord.page - PADS))}
    >
      ‹
    </button>
    <span class="flex-1 text-center">MIDI {chord.page}–{chord.page + PADS - 1}</span>
    <button
      class="border border-border-soft px-1 hover:text-fg disabled:opacity-30"
      type="button"
      disabled={chord.page >= 112}
      onclick={() => (chord.page = Math.min(112, chord.page + PADS))}
    >
      ›
    </button>
  </div>

  <div class="grid grid-cols-4 gap-[3px]">
    {#each Array(PADS) as _, i}
      {@const pad = chord.page + i}
      <button
        class="flex flex-col items-start border px-1 py-[3px] text-left leading-tight {playingPad === pad
          ? 'border-fg-bright bg-fg/10 text-fg-bright'
          : chord.selected === pad
            ? 'border-border-strong bg-panel-2 text-fg-bright'
            : 'border-border-soft bg-bg text-muted-2 hover:border-border'}"
        type="button"
        onclick={() => trigger(pad)}
      >
        <span class="text-[10px]">{name(pad)}</span>
        <span class="text-[8px] text-muted">{prettyName(pad)} · {PAD_KEYS[i]}{chord.prog.slice(0, chord.progLen).includes(pad) ? ' •' : ''}</span>
      </button>
    {/each}
  </div>

  <div class="border-t border-border-soft pt-1.5">
    <p class="m-0 mb-1 text-[9px] text-muted">
      voices · {chord.mappingMode === 'memory' ? 'drag to pitch, drag bar for level, ' : ''}▪ locks a pedal tone
    </p>
    <div class="grid grid-cols-8 gap-[3px]">
      {#each Array(VOICES) as _, v}
        {@const note = chord.lock[v]
          ? chord.lockVal[v]
          : chord.mappingMode === 'memory'
            ? chord.slots[chord.selected].voices[v]
            : generated.notes[v]}
        <div class="flex flex-col items-center gap-[3px]">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="w-full border border-border-soft bg-bg py-[2px] text-center text-[9px] {chord.mappingMode === 'memory'
              ? 'cursor-ns-resize'
              : ''} {note ==
            null
              ? 'text-muted'
              : 'text-fg'}"
            onpointerdown={(e) => chord.mappingMode === 'memory' && dragVoice(e, v)}
          >
            {note == null ? 'off' : prettyName(note)}
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="relative h-6 w-full border border-border-soft bg-bg {chord.mappingMode === 'memory'
              ? 'cursor-ns-resize'
              : ''}"
            onpointerdown={(e) => chord.mappingMode === 'memory' && dragVel(e, v)}
            title="velocity {Math.round((chord.mappingMode === 'memory' ? chord.slots[chord.selected].vel[v] ?? 1 : 1) * 100)}%"
          >
            <i
              class="absolute bottom-0 left-0 w-full bg-muted"
              style:height="{Math.min(100, ((chord.mappingMode === 'memory' ? chord.slots[chord.selected].vel[v] ?? 1 : 1) / 2) * 100)}%"
            ></i>
          </div>
          <button
            class="size-[7px] border border-port p-0 {chord.lock[v] ? 'bg-fg' : 'bg-bg'}"
            type="button"
            aria-label="lock voice {v + 1}"
            onclick={() => toggleLock(v)}
          ></button>
        </div>
      {/each}
    </div>
    {#if chord.mappingMode === 'memory'}
      <div class="mt-1 flex gap-1 text-[8px] text-muted">
        <button class="border border-border-soft px-1 hover:text-fg" type="button" onclick={copySlot}>copy</button>
        <button class="border border-border-soft px-1 hover:text-fg disabled:opacity-30" type="button" disabled={!copied} onclick={pasteSlot}>paste</button>
        <button class="border border-border-soft px-1 hover:text-fg" type="button" onclick={clearSlot}>clear</button>
      </div>
    {/if}
  </div>

  <div class="border-t border-border-soft pt-1.5">
    <div class="mb-1 flex items-center gap-2">
      <button
        class="border px-1 text-[9px] {chord.progOn
          ? 'border-border-strong text-fg-bright'
          : 'border-border-soft text-muted'}"
        type="button"
        onclick={() => (chord.progOn = !chord.progOn)}
      >
        progression
      </button>
      <span class="text-[9px] text-muted">
        {chord.progOn ? 'one bar per slot · click a slot to drop the selected pad' : 'off — the selected pad plays'}
      </span>
    </div>
    <div class="flex gap-[3px]">
      {#each Array(chord.progLen) as _, i}
        <button
          class="h-6 flex-1 border text-[9px] {playingSlot === i
            ? 'border-fg-bright bg-fg/10 text-fg-bright'
            : chord.prog[i] >= 0
              ? 'border-border bg-panel-2 text-fg'
              : 'border-border-soft bg-bg text-muted'}"
          type="button"
          onclick={(e) => setProg(i, e)}
          title="alt-click for a rest"
        >
          {chord.prog[i] >= 0 ? name(chord.prog[i]) : '·'}
        </button>
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border-soft pt-1.5">
    <label class="grid grid-cols-[38px_1fr_auto] items-center gap-1 text-[9px] text-muted">
      <span>bars</span>
      <input type="range" min="1" max="8" step="1" bind:value={chord.progLen} class="accent-muted" />
      <em class="not-italic text-muted-2">{chord.progLen}</em>
    </label>
    <label class="grid grid-cols-[38px_1fr_auto] items-center gap-1 text-[9px] text-muted">
      <span>transp</span>
      <input type="range" min="-12" max="12" step="1" bind:value={chord.transpose} class="accent-muted" />
      <em class="not-italic text-muted-2">{chord.transpose}</em>
    </label>
    <label class="grid grid-cols-[38px_1fr_auto] items-center gap-1 text-[9px] text-muted">
      <span>strum</span>
      <input type="range" min="0" max="0.06" step="0.005" bind:value={chord.strum} class="accent-muted" />
      <em class="not-italic text-muted-2">{chord.strum}</em>
    </label>
    <label class="grid grid-cols-[38px_1fr_auto] items-center gap-1 text-[9px] text-muted">
      <span>hold</span>
      <input type="range" min="0.1" max="1.5" step="0.05" bind:value={chord.hold} class="accent-muted" />
      <em class="not-italic text-muted-2">{chord.hold}</em>
    </label>
  </div>

  <div class="flex items-center gap-1.5 border-t border-border-soft pt-1.5 text-[9px]">
    <button
      class="border px-1 {chord.keys ? 'border-border-strong text-fg-bright' : 'border-border-soft text-muted'}"
      type="button"
      onclick={() => (chord.keys = !chord.keys)}
    >
      keys
    </button>
    <button
      class="border px-1 {chord.midi ? 'border-border-strong text-fg-bright' : 'border-border-soft text-muted'}"
      type="button"
      onclick={() => (chord.midi = !chord.midi)}
    >
      midi in
    </button>
    <button
      class="border px-1 {chord.latch ? 'border-border-strong text-fg-bright' : 'border-border-soft text-muted'}"
      type="button"
      title="hold a chord until the next trigger"
      onclick={() => (chord.latch = !chord.latch)}
    >
      latch
    </button>
    <button
      class="border px-1 {learning ? 'border-border-strong text-fg-bright' : 'border-border-soft text-muted'}"
      type="button"
      title="capture MIDI chords and advance through memory slots"
      onclick={() => {
        learning = !learning
        learnHeld.clear()
        learnChord.clear()
      }}
    >
      learn
    </button>
    <button
      class="border border-border-soft px-1 text-muted hover:text-fg disabled:opacity-30"
      type="button"
      disabled={chord.mappingMode !== 'memory'}
      onclick={randomizePad}
    >
      wtf
    </button>
    <span class="ml-auto text-muted">
      {midiError ?? held.notes.map(prettyName).join(' ')}
    </span>
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
        deleteChordPreset(selectedPreset)
        selectedPreset = ''
        refreshPresets()
      }}
    >
      del
    </button>
  </div>
</div>

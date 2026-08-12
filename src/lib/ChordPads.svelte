<script lang="ts">
  import { Chord } from '@tonaljs/tonal'
  import {
    PADS,
    PAD_KEYS,
    VOICES,
    heldNotes,
    padForKey,
    padForMidi,
    prettyName,
    progSlotAtCycle,
    type ChordData,
  } from './chord-engine'
  import { enableMidi, onMidiNote } from './midi'
  import { clock, watchClock } from './transport.svelte'

  interface Props {
    chord: ChordData
    /** module is switched on, so its playhead is worth showing */
    live?: boolean
  }

  let { chord = $bindable(), live = true }: Props = $props()

  let midiError = $state<string | null>(null)

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
    const slot = chord.slots[chord.current]
    const base = slot.voices[v] ?? 47
    drag(e, (up) => {
      const next = base + Math.round(up / 6)
      slot.voices[v] = next < 24 ? null : Math.min(96, next)
    })
  }

  function dragVel(e: PointerEvent, v: number) {
    const slot = chord.slots[chord.current]
    const base = slot.vel[v] ?? 1
    drag(e, (up) => {
      slot.vel[v] = Math.max(0, Math.min(2, Math.round((base + up / 30) * 20) / 20))
    })
  }

  function toggleLock(v: number) {
    chord.lock[v] = !chord.lock[v]
    chord.lockVal[v] = chord.lock[v] ? chord.slots[chord.current].voices[v] : null
  }

  function setProg(i: number, e: MouseEvent) {
    chord.prog[i] = e.altKey || e.shiftKey ? -1 : chord.current
  }

  function randomizePad() {
    const slot = chord.slots[chord.current]
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

  const held = $derived(heldNotes(chord, chord.current))

  $effect(() => {
    if (!chord.keys) return
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && target.closest('input, select, textarea')) return
      const pad = padForKey(e.key)
      if (pad >= 0) {
        chord.current = pad
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
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
    const off = onMidiNote((note) => {
      chord.current = padForMidi(note)
    })
    return () => {
      live = false
      off()
    }
  })
</script>

<div class="mt-2 flex flex-col gap-2" data-nodrag>
  <div class="grid grid-cols-4 gap-[3px]">
    {#each Array(PADS) as _, i}
      <button
        class="flex flex-col items-start border px-1 py-[3px] text-left leading-tight {playingPad === i
          ? 'border-fg-bright bg-fg/10 text-fg-bright'
          : chord.current === i
            ? 'border-border-strong bg-panel-2 text-fg-bright'
            : 'border-border-soft bg-bg text-muted-2 hover:border-border'}"
        type="button"
        onclick={() => (chord.current = i)}
      >
        <span class="text-[10px]">{name(i)}</span>
        <span class="text-[8px] text-muted">{PAD_KEYS[i]}{chord.prog.slice(0, chord.progLen).includes(i) ? ' •' : ''}</span>
      </button>
    {/each}
  </div>

  <div class="border-t border-border-soft pt-1.5">
    <p class="m-0 mb-1 text-[9px] text-muted">
      voices · drag to pitch, drag bar for level, ▪ locks a pedal tone
    </p>
    <div class="grid grid-cols-8 gap-[3px]">
      {#each Array(VOICES) as _, v}
        {@const note = chord.lock[v] ? chord.lockVal[v] : chord.slots[chord.current].voices[v]}
        <div class="flex flex-col items-center gap-[3px]">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="w-full cursor-ns-resize border border-border-soft bg-bg py-[2px] text-center text-[9px] {note ==
            null
              ? 'text-muted'
              : 'text-fg'}"
            onpointerdown={(e) => dragVoice(e, v)}
          >
            {note == null ? 'off' : prettyName(note)}
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="relative h-6 w-full cursor-ns-resize border border-border-soft bg-bg"
            onpointerdown={(e) => dragVel(e, v)}
            title="velocity {Math.round((chord.slots[chord.current].vel[v] ?? 1) * 100)}%"
          >
            <i
              class="absolute bottom-0 left-0 w-full bg-muted"
              style:height="{Math.min(100, ((chord.slots[chord.current].vel[v] ?? 1) / 2) * 100)}%"
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
    <button class="border border-border-soft px-1 text-muted hover:text-fg" type="button" onclick={randomizePad}>
      wtf
    </button>
    <span class="ml-auto text-muted">
      {midiError ?? held.notes.map(prettyName).join(' ')}
    </span>
  </div>
</div>

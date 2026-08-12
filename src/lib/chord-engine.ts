/**
 * Chord memory and pattern arpeggiator.
 *
 * The arpeggio is simulated step-by-step and emitted as a concrete audio pattern.
 */

export const VOICES = 8
export const PADS = 16
export const MAX_STEPS = 32
export const MAX_PROG = 8

/* ------------------------------------------------------------------ chords */

export interface ChordSlot {
  /** MIDI note per voice, `null` = OFF */
  voices: (number | null)[]
  /** velocity scaling per voice, 0..2 (0-200%) */
  vel: number[]
}

export interface ChordData {
  slots: ChordSlot[]
  /** last triggered pad — what a live press latches */
  current: number
  /** per-voice pedal-tone locks, held across every pad */
  lock: boolean[]
  lockVal: (number | null)[]
  transpose: number
  /** pad index per bar, -1 = silence */
  prog: number[]
  progLen: number
  progOn: boolean
  /** cycles of delay per voice when the chord plays un-arped */
  strum: number
  /** note length multiplier for un-arped output */
  hold: number
  midi: boolean
  keys: boolean
}

/* --------------------------------------------------------------------- arp */

export type LaneKey = 'note' | 'rand' | 'octave' | 'pitch' | 'vel' | 'gate' | 'late' | 'harmony'

export interface LaneDef {
  key: LaneKey
  label: string
  min: number
  max: number
  step: number
  center: number
}

export const LANES: LaneDef[] = [
  { key: 'note', label: 'note', min: 0, max: 16, step: 1, center: 9 },
  { key: 'rand', label: 'rand', min: -4, max: 4, step: 1, center: 0 },
  { key: 'octave', label: 'oct', min: -3, max: 3, step: 1, center: 0 },
  { key: 'pitch', label: 'pitch', min: -12, max: 12, step: 1, center: 0 },
  { key: 'vel', label: 'vel', min: 0, max: 2, step: 0.1, center: 1 },
  { key: 'gate', label: 'gate', min: 0.1, max: 2, step: 0.1, center: 0.8 },
  { key: 'late', label: 'late', min: -0.5, max: 0.5, step: 0.125, center: 0 },
  { key: 'harmony', label: 'harm', min: -12, max: 12, step: 1, center: 0 },
]

export const LANE_BY_KEY: Record<LaneKey, LaneDef> = Object.fromEntries(
  LANES.map((l) => [l.key, l]),
) as Record<LaneKey, LaneDef>

/** note-lane shapes, ordered bottom-to-top */
export const SHAPES = ['up', 'down', 'up/dn', 'dn/up', 'up+dn', 'dn+up', 'fng lo', 'fng hi'] as const

/** note cell: 0 = off, 1..8 = chord voice (1 = lowest), 9..16 = SHAPES */
export const SHAPE_BASE = 9

export const RATES = [
  { value: '1/2', label: '1/2', steps: 2 },
  { value: '1/4', label: '1/4', steps: 4 },
  { value: '1/4t', label: '1/4T', steps: 6 },
  { value: '1/8', label: '1/8', steps: 8 },
  { value: '1/8t', label: '1/8T', steps: 12 },
  { value: '1/16', label: '1/16', steps: 16 },
  { value: '1/16t', label: '1/16T', steps: 24 },
  { value: '1/32', label: '1/32', steps: 32 },
]

export interface ArpData {
  lanes: Record<LaneKey, number[]>
  len: Record<LaneKey, number>
  div: Record<LaneKey, number>
  /** note-tab per-step flags */
  reset: boolean[]
  tie: boolean[]
  mute: boolean[]
  linkLen: boolean
  rate: string
  chordMode: boolean
  /** which scale degrees (I..VII) the pitch lane may transpose */
  degrees: boolean[]
  /** per pitch-class: 0 allow, 1 block, 2 block+semitone up, 3 block+semitone down */
  prevent: number[]
  /** currently edited lane (ui state) */
  tab: LaneKey
}

/* ---------------------------------------------------------------- defaults */

const NAMES = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b']

/** MIDI note naming uses C3 = 48 */
export function midiName(m: number): string {
  const n = Math.round(m)
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

export function prettyName(m: number): string {
  return midiName(m).replace('s', '#')
}

function slot(notes: number[]): ChordSlot {
  const voices: (number | null)[] = Array.from({ length: VOICES }, (_, i) => notes[i] ?? null)
  return { voices, vel: Array.from({ length: VOICES }, () => 1) }
}

const DEFAULT_PADS: number[][] = [
  [48, 51, 55, 58], // Cm7
  [44, 48, 51, 55], // Abmaj7
  [51, 55, 58, 62], // Ebmaj7
  [46, 50, 53, 55], // Bb6
  [41, 44, 48, 51, 55], // Fm9
  [43, 46, 50, 53], // Gm7
  [50, 53, 56, 60], // Dm7b5
  [43, 48, 53, 58], // G7sus
  [41, 45, 48, 52, 55], // Fmaj9
  [45, 48, 52, 55], // Am7
  [50, 53, 57, 60, 64], // Dm9
  [46, 50, 53, 57], // Bbmaj7
  [48, 52, 55, 57, 62], // C6/9
  [52, 57, 59, 62], // Esus
  [43, 48, 50, 53], // Gsus4
  [43, 48, 52, 55, 59], // C/G
]

export function defaultChordData(): ChordData {
  return {
    slots: DEFAULT_PADS.map(slot),
    current: 0,
    lock: Array.from({ length: VOICES }, () => false),
    lockVal: Array.from({ length: VOICES }, () => null),
    transpose: 0,
    prog: [0, 1, 2, 3, 0, 1, 2, 3],
    progLen: 4,
    progOn: true,
    strum: 0,
    hold: 0.9,
    midi: false,
    keys: true,
  }
}

export function defaultArpData(): ArpData {
  const lanes = Object.fromEntries(
    LANES.map((l) => [l.key, Array.from({ length: MAX_STEPS }, () => l.center)]),
  ) as Record<LaneKey, number[]>
  const len = Object.fromEntries(LANES.map((l) => [l.key, 16])) as Record<LaneKey, number>
  const div = Object.fromEntries(LANES.map((l) => [l.key, 1])) as Record<LaneKey, number>
  return {
    lanes,
    len,
    div,
    reset: Array.from({ length: MAX_STEPS }, () => false),
    tie: Array.from({ length: MAX_STEPS }, () => false),
    mute: Array.from({ length: MAX_STEPS }, () => false),
    linkLen: true,
    rate: '1/16',
    chordMode: false,
    degrees: [true, true, true, true, true, true, true],
    prevent: Array.from({ length: 12 }, () => 0),
    tab: 'note',
  }
}

/* ------------------------------------------------------------------ theory */

export interface Held {
  notes: number[]
  vel: number[]
}

/** the notes a pad sends out, sorted low→high, with locks and transpose applied */
export function heldNotes(chord: ChordData, pad: number): Held {
  const s = chord.slots[pad]
  if (!s) return { notes: [], vel: [] }
  const pairs: { note: number; vel: number }[] = []
  for (let v = 0; v < VOICES; v++) {
    const locked = chord.lock[v] ? chord.lockVal[v] : undefined
    const note = locked ?? s.voices[v]
    if (note == null) continue
    if (pairs.some((p) => p.note === note + chord.transpose)) continue
    pairs.push({ note: note + chord.transpose, vel: s.vel[v] ?? 1 })
  }
  pairs.sort((a, b) => a.note - b.note)
  return { notes: pairs.map((p) => p.note), vel: pairs.map((p) => p.vel) }
}

/** hindemith-ish root: lowest note of the first perfect fifth, else a fourth's top, else bass */
export function chordRoot(notes: number[]): number {
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if ((notes[j] - notes[i]) % 12 === 7) return notes[i] % 12
    }
  }
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if ((notes[j] - notes[i]) % 12 === 5) return notes[j] % 12
    }
  }
  return notes.length ? notes[0] % 12 : 0
}

const DEGREE_OF_INTERVAL = [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7]

function degreeOf(note: number, rootPc: number): number {
  return DEGREE_OF_INTERVAL[(((note - rootPc) % 12) + 12) % 12]
}

/** index sequence a shape walks through for a chord of n notes */
export function shapeSeq(shape: number, n: number): number[] {
  if (n <= 1) return [0]
  const up = Array.from({ length: n }, (_, i) => i)
  const down = [...up].reverse()
  switch (shape) {
    case 0:
      return up
    case 1:
      return down
    case 2:
      return [...up, ...down.slice(1, -1)]
    case 3:
      return [...down, ...up.slice(1, -1)]
    case 4:
      return [...up, ...down]
    case 5:
      return [...down, ...up]
    case 6:
      return up.slice(1).flatMap((i) => [0, i])
    case 7:
      return up.slice(0, -1).flatMap((i) => [i, n - 1])
    default:
      return up
  }
}

/* ---------------------------------------------------------------- simulate */

interface StepEvent {
  /** step the note sounds on */
  index: number
  /** candidate note sets — more than one when the rand lane is open */
  alts: number[][]
  gain: number
  /** length in steps */
  durSteps: number
  /** offset in steps, -0.5..0.5 */
  late: number
}

export function stepsPerCycle(rate: string): number {
  return RATES.find((r) => r.value === rate)?.steps ?? 16
}

/** the cell of a lane that is in play on a given step — each lane clocks itself */
export function laneIndex(arp: ArpData, key: LaneKey, step: number): number {
  const len = Math.max(1, arp.len[key])
  const div = Math.max(1, arp.div[key])
  return Math.floor(step / div) % len
}

function laneValue(arp: ArpData, key: LaneKey, step: number): number {
  return arp.lanes[key][laneIndex(arp, key, step)] ?? LANE_BY_KEY[key].center
}

function laneActive(arp: ArpData, key: LaneKey): boolean {
  const center = LANE_BY_KEY[key].center
  const len = Math.max(1, arp.len[key])
  return arp.lanes[key].slice(0, len).some((v) => v !== center)
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
const lcm = (a: number, b: number) => (a * b) / gcd(a, b)

/** how many steps until the whole thing (lanes + chord progression) repeats */
function arpPeriod(arp: ArpData, chord: ChordData | null, perCycle: number): number {
  let period = lcm(perCycle, Math.max(1, arp.len.note) * Math.max(1, arp.div.note))
  for (const l of LANES) {
    if (l.key === 'note' || !laneActive(arp, l.key)) continue
    period = lcm(period, Math.max(1, arp.len[l.key]) * Math.max(1, arp.div[l.key]))
  }
  if (chord?.progOn) period = lcm(period, Math.max(1, chord.progLen) * perCycle)
  const cap = perCycle * Math.max(1, Math.floor(256 / perCycle))
  return Math.min(period, cap)
}

/** step counter at a transport position — the emitted pattern always starts at cycle 0 */
export function stepAtCycle(arp: ArpData, cycle: number): number {
  return Math.floor(cycle * stepsPerCycle(arp.rate))
}

/** progression slot playing at a transport position, one bar per slot; -1 when it is off */
export function progSlotAtCycle(chord: ChordData, cycle: number): number {
  if (!chord.progOn) return -1
  const len = Math.max(1, chord.progLen)
  return ((Math.floor(cycle) % len) + len) % len
}

function padAt(chord: ChordData, step: number, perCycle: number): number {
  const slot = progSlotAtCycle(chord, step / perCycle)
  if (slot < 0) return chord.current
  return chord.prog[slot] ?? -1
}

/** block / redirect note-prevention rules */
function allowNote(arp: ArpData, note: number): number | null {
  const state = arp.prevent[(((note % 12) + 12) % 12)] ?? 0
  if (state === 0) return note
  if (state === 2) return note + 1
  if (state === 3) return note - 1
  return null
}

function voiceAt(held: Held, slotIndex: number): { note: number; vel: number } | null {
  const n = held.notes.length
  if (!n) return null
  const i = ((slotIndex % n) + n) % n
  const octave = Math.floor(slotIndex / n)
  return { note: held.notes[i] + 12 * octave, vel: held.vel[i] ?? 1 }
}

function simulate(arp: ArpData, chord: ChordData | null, perCycle: number) {
  const period = arpPeriod(arp, chord, perCycle)
  const events: StepEvent[] = []
  const fallback: Held = { notes: [48, 51, 55, 58], vel: [1, 1, 1, 1] }
  let pos = 0
  let last: StepEvent | null = null

  for (let step = 0; step < period; step++) {
    const idx = laneIndex(arp, 'note', step)
    const cell = arp.lanes.note[idx] ?? 0
    if (arp.mute[idx] || cell === 0) continue

    const pad = chord ? padAt(chord, step, perCycle) : -1
    const held = chord ? (pad < 0 ? { notes: [], vel: [] } : heldNotes(chord, pad)) : fallback
    if (!held.notes.length) continue

    if (arp.tie[idx]) {
      if (last) last.durSteps += 1
      continue
    }
    if (arp.reset[idx]) pos = 0

    let base: number
    if (cell < SHAPE_BASE) {
      base = cell - 1
    } else {
      const seq = shapeSeq(cell - SHAPE_BASE, held.notes.length)
      base = seq[pos % seq.length]
      pos += 1
    }

    const rand = Math.round(laneValue(arp, 'rand', step))
    const lo = rand < 0 ? base + rand : base
    const hi = rand > 0 ? base + rand : base
    const octave = Math.round(laneValue(arp, 'octave', step))
    const semis = Math.round(laneValue(arp, 'pitch', step))
    const harmony = Math.round(laneValue(arp, 'harmony', step))
    const rootPc = chordRoot(held.notes)

    const alts: number[][] = []
    for (let s = lo; s <= hi; s++) {
      const picked = voiceAt(held, Math.max(0, s))
      if (!picked) continue
      let pitch = picked.note + 12 * octave
      if (semis && arp.degrees[degreeOf(pitch, rootPc) - 1]) pitch += semis

      let notes = [pitch]
      if (harmony) notes.push(pitch + harmony)
      if (arp.chordMode) {
        for (const other of held.notes) {
          let lifted = other
          while (lifted <= pitch) lifted += 12
          notes.push(lifted)
        }
      }
      notes = notes
        .map((n) => allowNote(arp, n))
        .filter((n): n is number => n != null)
        .filter((n, i, a) => a.indexOf(n) === i)
        .sort((a, b) => a - b)
      if (notes.length) alts.push(notes)
    }
    if (!alts.length) continue

    const picked = voiceAt(held, Math.max(0, base))
    const ev: StepEvent = {
      index: step,
      alts,
      gain: 0.9 * laneValue(arp, 'vel', step) * (picked?.vel ?? 1),
      durSteps: Math.max(0.05, laneValue(arp, 'gate', step)),
      late: laneValue(arp, 'late', step),
    }
    events.push(ev)
    last = ev
  }

  return { events, period }
}

/* -------------------------------------------------------------- code emit */

const num = (n: number) => String(Math.round(n * 1000) / 1000)

/** a per-step control lane, collapsed to a plain number when nothing varies */
function lane(values: number[]): string {
  if (values.every((v) => v === values[0])) return num(values[0])
  return `"${values.map(num).join(' ')}"`
}

function noteToken(notes: number[]): string {
  const names = notes.map(midiName)
  return names.length > 1 ? `[${names.join(',')}]` : names[0]
}

function altToken(alts: number[][]): string {
  if (alts.length === 1) return noteToken(alts[0])
  return `[${alts.map(noteToken).join('|')}]`
}

/** late/early is drawn into the step's own slot using mini-notation weights */
const TICKS = 8

/**
 * Render the arp as `note(...)` with per-step gain and absolute durations.
 * Returns '' when nothing sounds.
 */
export function arpNoteCode(arp: ArpData, chord: ChordData | null): string {
  const perCycle = stepsPerCycle(arp.rate)
  const { events, period } = simulate(arp, chord, perCycle)
  if (!events.length) return ''

  const slots: string[] = Array.from({ length: period }, () => '~')
  const gains: number[] = Array.from({ length: period }, () => 1)
  const durs: number[] = Array.from({ length: period }, () => 1 / perCycle)

  for (const ev of events) {
    const token = altToken(ev.alts)
    const ticks = Math.round(Math.abs(ev.late) * TICKS)
    let onset = ev.index
    if (ev.late > 0 && ticks > 0 && ticks < TICKS) {
      slots[ev.index] = `[~@${ticks} ${token}@${TICKS - ticks}]`
    } else if (ev.late < 0 && ticks > 0 && ticks < TICKS) {
      const prev = (ev.index - 1 + period) % period
      if (slots[prev] === '~') {
        slots[prev] = `[~@${TICKS - ticks} ${token}@${ticks}]`
        onset = prev
      } else {
        slots[ev.index] = token
      }
    } else {
      slots[ev.index] = token
    }
    gains[onset] = ev.gain
    durs[onset] = ev.durSteps / perCycle
  }

  let code = `note("${slots.join(' ')}")`
  if (gains.some((g) => g !== 1)) code += `.gain(${lane(gains)})`
  code += `.duration(${lane(durs)})`
  const bars = period / perCycle
  if (bars > 1) code += `.slow(${bars})`
  return code
}

/** the chord module on its own: block chords (optionally strummed), one per bar */
export function chordNoteCode(chord: ChordData): string {
  const steps = chord.progOn
    ? Array.from({ length: Math.max(1, chord.progLen) }, (_, i) => chord.prog[i] ?? -1)
    : [chord.current]

  const held = steps.map((pad) => (pad < 0 ? { notes: [], vel: [] } : heldNotes(chord, pad)))
  const width = Math.max(0, ...held.map((h) => h.notes.length))
  if (!width) return ''

  const layers: string[] = []
  for (let v = 0; v < width; v++) {
    const tokens = held.map((h) => (h.notes[v] == null ? '~' : midiName(h.notes[v])))
    if (tokens.every((t) => t === '~')) continue
    const vels = held.map((h) => 0.9 * (h.vel[v] ?? 1))
    let layer = tokens.length > 1 ? `note("<${tokens.join(' ')}>")` : `note("${tokens[0]}")`
    if (vels.some((g) => g !== 0.9)) {
      layer += vels.length > 1 ? `.gain("<${vels.map(num).join(' ')}>")` : `.gain(${num(vels[0])})`
    } else {
      layer += `.gain(0.9)`
    }
    if (chord.strum && v) layer += `.late(${num(v * chord.strum)})`
    layers.push(layer)
  }
  if (!layers.length) return ''

  let code = layers.length > 1 ? `stack(${layers.join(', ')})` : layers[0]
  if (chord.hold !== 1) code += `.clip(${num(chord.hold)})`
  return code
}

/* ------------------------------------------------------------ pad triggers */

/** home-row style pad mapping, so the chords can be played on the computer keyboard */
export const PAD_KEYS = [
  'a',
  's',
  'd',
  'f',
  'g',
  'h',
  'j',
  'k',
  'z',
  'x',
  'c',
  'v',
  'b',
  'n',
  'm',
  ',',
]

export function padForKey(key: string): number {
  return PAD_KEYS.indexOf(key.toLowerCase())
}

/** map an incoming MIDI pitch to a pad */
export function padForMidi(note: number): number {
  return (((note % PADS) + PADS) % PADS)
}

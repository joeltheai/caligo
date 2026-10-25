/**
 * Chord memory and pattern arpeggiator.
 *
 * The arpeggio is simulated step-by-step and emitted as a concrete audio pattern.
 */

import { ChordType, Interval, Note, Scale, ScaleType } from '@tonaljs/tonal'

export const VOICES = 8
/** number of chord pads shown at once */
export const PADS = 16
/** one chord-memory slot per MIDI note */
export const CHORD_SLOTS = 128
export const MAX_STEPS = 32
export const MAX_PROG = 8
/** ceiling on the emitted loop, in steps — 1024 is 64 bars of 1/16 */
export const MAX_LOOP_STEPS = 1024

/* ------------------------------------------------------------------ chords */

export interface ChordSlot {
  /** MIDI note per voice, `null` = OFF */
  voices: (number | null)[]
  /** velocity scaling per voice, 0..2 (0-200%) */
  vel: number[]
}

export type ChordMappingMode = 'memory' | 'degree' | 'root-quality'
export type ScaleSnap = 'silence' | 'nearest' | 'up' | 'down'
export type VoicingMode = 'close' | 'open'

export const SCALE_OPTIONS = [
  'major',
  'minor',
  'harmonic minor',
  'melodic minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'major pentatonic',
  'minor pentatonic',
  'major blues',
  'minor blues',
  'whole tone',
  'diminished',
  'bebop dominant',
  'phrygian dominant',
  'altered',
  'chromatic',
] as const

export const CHORD_QUALITY_OPTIONS = [
  { value: 'M', label: 'major' },
  { value: 'm', label: 'minor' },
  { value: 'dim', label: 'diminished' },
  { value: 'aug', label: 'augmented' },
  { value: 'sus2', label: 'sus2' },
  { value: 'sus4', label: 'sus4' },
  { value: '6', label: 'sixth' },
  { value: 'm6', label: 'minor sixth' },
  { value: 'maj7', label: 'major seventh' },
  { value: 'm7', label: 'minor seventh' },
  { value: '7', label: 'dominant seventh' },
  { value: 'm7b5', label: 'half diminished' },
  { value: 'dim7', label: 'diminished seventh' },
  { value: 'add9', label: 'add nine' },
  { value: 'madd9', label: 'minor add nine' },
  { value: 'maj9', label: 'major ninth' },
  { value: 'm9', label: 'minor ninth' },
  { value: '9', label: 'dominant ninth' },
  { value: '11', label: 'eleventh' },
  { value: '13', label: 'thirteenth' },
  { value: '7#5', label: 'seven sharp five' },
  { value: '7b9', label: 'seven flat nine' },
] as const

/** complete theory dictionaries, kept searchable in the UI behind the curated choices */
export const ALL_SCALE_OPTIONS = ScaleType.all()
  .map((scale) => scale.name)
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b))

export const ALL_CHORD_QUALITY_OPTIONS = ChordType.all()
  .filter((type) => type.aliases[0])
  .map((type) => ({ value: type.aliases[0], label: type.name || type.aliases.join(' / ') }))
  .filter((type, index, all) => all.findIndex((candidate) => candidate.value === type.value) === index)
  .sort((a, b) => a.label.localeCompare(b.label))

export type ChordBankId = 'init' | 'minor-triads' | 'major-triads' | 'diatonic-triads' | 'diatonic-sevenths'

export const CHORD_BANKS: { id: ChordBankId; label: string }[] = [
  { id: 'init', label: 'empty memory' },
  { id: 'minor-triads', label: 'chromatic minor triads' },
  { id: 'major-triads', label: 'chromatic major triads' },
  { id: 'diatonic-triads', label: 'scale diatonic triads' },
  { id: 'diatonic-sevenths', label: 'scale diatonic sevenths' },
]

export interface ChordData {
  slots: ChordSlot[]
  /** active MIDI-addressed slot; -1 means no live chord */
  current: number
  /** slot shown in the editor, independent from momentary note release */
  selected: number
  /** first slot in the visible 16-pad page */
  page: number
  mappingMode: ChordMappingMode
  tonic: string
  scaleType: string
  scaleSnap: ScaleSnap
  chordSize: number
  chordQuality: string
  voicing: VoicingMode
  inversion: number
  bank: ChordBankId
  latch: boolean
  triggerVelocity: number
  /** increments for every live trigger, even when the same note repeats */
  triggerSerial: number
  /** Strudel transport cycle at the last live trigger */
  triggerCycle: number
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
  { key: 'octave', label: 'oct', min: -8, max: 8, step: 1, center: 0 },
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
  { value: '1/1', label: '1/1', steps: 1 },
  { value: '1/2', label: '1/2', steps: 2 },
  { value: '1/4', label: '1/4', steps: 4 },
  { value: '1/4t', label: '1/4T', steps: 6 },
  { value: '1/8', label: '1/8', steps: 8 },
  { value: '1/8t', label: '1/8T', steps: 12 },
  { value: '1/16', label: '1/16', steps: 16 },
  { value: '1/16t', label: '1/16T', steps: 24 },
  { value: '1/32', label: '1/32', steps: 32 },
  { value: '1/32t', label: '1/32T', steps: 48 },
  { value: '1/64', label: '1/64', steps: 64 },
  { value: '1/64t', label: '1/64T', steps: 96 },
  { value: '1/128', label: '1/128', steps: 128 },
]

export interface ArpPatternState {
  lanes: Record<LaneKey, number[]>
  len: Record<LaneKey, number>
  div: Record<LaneKey, number>
  reset: boolean[]
  tie: boolean[]
  mute: boolean[]
  linkLen: boolean
  rate: string
  retrig: boolean
  chordMode: boolean
  degrees: boolean[]
  prevent: number[]
  swing: number
  globalGate: number
}

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
  /** restart the pattern on every new chord, instead of free-running across the bar line */
  retrig: boolean
  chordMode: boolean
  /** which scale degrees (I..VII) the pitch lane may transpose */
  degrees: boolean[]
  /** per pitch-class: 0 allow, 1 block, 2 block+semitone up, 3 block+semitone down */
  prevent: number[]
  /** delays alternating steps by a fraction of one step */
  swing: number
  /** multiplier applied after the per-step Gate lane */
  globalGate: number
  patterns: ArpPatternState[]
  pattern: number
  patternNames: string[]
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

function emptySlot(): ChordSlot {
  return slot([])
}

function chromaticSlot(root: number, intervals: number[]): ChordSlot {
  return slot(intervals.map((i) => root + i).filter((n) => n >= 0 && n <= 127).slice(0, VOICES))
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
  const slots = Array.from({ length: CHORD_SLOTS }, emptySlot)
  DEFAULT_PADS.forEach((notes, i) => {
    slots[48 + i] = slot(notes)
  })
  return {
    slots,
    current: 48,
    selected: 48,
    page: 48,
    mappingMode: 'memory',
    tonic: 'C',
    scaleType: 'minor',
    scaleSnap: 'silence',
    chordSize: 3,
    chordQuality: 'm7',
    voicing: 'close',
    inversion: 0,
    bank: 'init',
    latch: false,
    triggerVelocity: 1,
    triggerSerial: 0,
    triggerCycle: 0,
    lock: Array.from({ length: VOICES }, () => false),
    lockVal: Array.from({ length: VOICES }, () => null),
    transpose: 0,
    prog: [48, 49, 50, 51, 48, 49, 50, 51],
    progLen: 4,
    progOn: false,
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
  const active: ArpPatternState = {
    lanes,
    len,
    div,
    reset: Array.from({ length: MAX_STEPS }, () => false),
    tie: Array.from({ length: MAX_STEPS }, () => false),
    mute: Array.from({ length: MAX_STEPS }, () => false),
    linkLen: true,
    rate: '1/16',
    retrig: false,
    chordMode: false,
    degrees: [true, true, true, true, true, true, true],
    prevent: Array.from({ length: 12 }, () => 0),
    swing: 0,
    globalGate: 1,
  }
  return {
    ...active,
    patterns: Array.from({ length: 12 }, () => structuredClone(active)),
    pattern: 0,
    patternNames: Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i)),
    tab: 'note',
  }
}

const ARP_PATTERN_KEYS: (keyof ArpPatternState)[] = [
  'lanes',
  'len',
  'div',
  'reset',
  'tie',
  'mute',
  'linkLen',
  'rate',
  'retrig',
  'chordMode',
  'degrees',
  'prevent',
  'swing',
  'globalGate',
]

export function captureArpPattern(arp: ArpData): ArpPatternState {
  return Object.fromEntries(ARP_PATTERN_KEYS.map((key) => [key, structuredClone(arp[key])])) as unknown as ArpPatternState
}

export function selectArpPattern(arp: ArpData, target: number, copy = false): void {
  const index = Math.max(0, Math.min(11, Math.round(target)))
  arp.patterns[arp.pattern] = captureArpPattern(arp)
  if (copy) arp.patterns[index] = captureArpPattern(arp)
  const next = structuredClone(arp.patterns[index])
  for (const key of ARP_PATTERN_KEYS) Object.assign(arp, { [key]: next[key] })
  arp.pattern = index
}

/* ------------------------------------------------------------------ theory */

export interface Held {
  notes: number[]
  vel: number[]
}

export const TONICS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

function pitchClass(note: string): number {
  return Note.chroma(note) ?? 0
}

function fitVoicing(notes: number[], chord: ChordData): number[] {
  const voiced = [...notes].sort((a, b) => a - b)
  if (chord.voicing === 'open' && voiced.length >= 3) voiced[1] += 12
  voiced.sort((a, b) => a - b)
  for (let i = 0; i < Math.max(0, Math.min(VOICES - 1, chord.inversion)); i++) {
    const low = voiced.shift()
    if (low != null) voiced.push(low + 12)
  }
  return voiced.filter((n) => n >= 0 && n <= 127).slice(0, VOICES)
}

function snappedScaleNote(chord: ChordData, note: number): { note: number; degree: number; pcs: number[] } | null {
  const scale = Scale.get(`${chord.tonic} ${chord.scaleType}`)
  const pcs = scale.notes.map(pitchClass)
  if (!pcs.length) return null
  const pc = ((note % 12) + 12) % 12
  let delta = 0
  if (!pcs.includes(pc)) {
    if (chord.scaleSnap === 'silence') return null
    if (chord.scaleSnap === 'up') {
      while (delta < 12 && !pcs.includes((pc + delta) % 12)) delta += 1
    } else if (chord.scaleSnap === 'down') {
      while (delta > -12 && !pcs.includes(((pc + delta) % 12 + 12) % 12)) delta -= 1
    } else {
      for (let distance = 1; distance < 12; distance++) {
        if (pcs.includes(((pc - distance) % 12 + 12) % 12)) {
          delta = -distance
          break
        }
        if (pcs.includes((pc + distance) % 12)) {
          delta = distance
          break
        }
      }
    }
  }
  const snapped = note + delta
  return { note: snapped, degree: pcs.indexOf(((snapped % 12) + 12) % 12), pcs }
}

function degreeNotes(chord: ChordData, note: number): number[] {
  const found = snappedScaleNote(chord, note)
  if (!found || found.degree < 0) return []
  const count = Math.max(2, Math.min(7, Math.round(chord.chordSize)))
  const rootPc = ((found.note % 12) + 12) % 12
  const notes: number[] = []
  for (let voice = 0; voice < count; voice++) {
    const degreeOffset = voice * 2
    const pc = found.pcs[(found.degree + degreeOffset) % found.pcs.length]
    const chromaticOffset = ((pc - rootPc) % 12 + 12) % 12
    const extraOctaves = Math.floor(degreeOffset / found.pcs.length)
    notes.push(found.note + chromaticOffset + extraOctaves * 12)
  }
  return fitVoicing(notes, chord)
}

function qualityNotes(chord: ChordData, note: number): number[] {
  const type = ChordType.get(chord.chordQuality)
  if (type.empty) return [note]
  const notes = type.intervals
    .map((interval) => Interval.semitones(interval))
    .filter((n): n is number => Number.isFinite(n))
    .map((semitones) => note + semitones)
  return fitVoicing(notes, chord)
}

function applyLocks(chord: ChordData, notes: (number | null)[], velocities: number[]): Held {
  const pairs: { note: number; vel: number }[] = []
  for (let v = 0; v < VOICES; v++) {
    const locked = chord.lock[v] ? chord.lockVal[v] : undefined
    const note = locked ?? notes[v]
    if (note == null) continue
    if (pairs.some((p) => p.note === note + chord.transpose)) continue
    pairs.push({ note: note + chord.transpose, vel: velocities[v] ?? 1 })
  }
  pairs.sort((a, b) => a.note - b.note)
  return { notes: pairs.map((p) => p.note), vel: pairs.map((p) => p.vel) }
}

/** notes emitted for a MIDI-addressed slot, with mapping, locks, and transpose applied */
export function heldNotes(chord: ChordData, pad: number): Held {
  if (pad < 0 || pad >= CHORD_SLOTS) return { notes: [], vel: [] }
  if (chord.mappingMode === 'degree') {
    const notes = degreeNotes(chord, pad)
    return applyLocks(chord, notes, notes.map(() => 1))
  }
  if (chord.mappingMode === 'root-quality') {
    const notes = qualityNotes(chord, pad)
    return applyLocks(chord, notes, notes.map(() => 1))
  }
  const s = chord.slots[pad]
  if (!s) return { notes: [], vel: [] }
  return applyLocks(chord, s.voices, s.vel)
}

/** replace the editable 128-slot memory with a generated bank */
export function applyChordBank(chord: ChordData, bank: ChordBankId): void {
  const slots = Array.from({ length: CHORD_SLOTS }, emptySlot)
  if (bank === 'minor-triads' || bank === 'major-triads') {
    const intervals = bank === 'minor-triads' ? [0, 3, 7] : [0, 4, 7]
    for (let root = 0; root < CHORD_SLOTS; root++) slots[root] = chromaticSlot(root, intervals)
  } else if (bank === 'diatonic-triads' || bank === 'diatonic-sevenths') {
    const priorMode = chord.mappingMode
    const priorSize = chord.chordSize
    const priorSnap = chord.scaleSnap
    chord.mappingMode = 'degree'
    chord.chordSize = bank === 'diatonic-triads' ? 3 : 4
    chord.scaleSnap = 'silence'
    for (let root = 0; root < CHORD_SLOTS; root++) slots[root] = slot(degreeNotes(chord, root))
    chord.mappingMode = priorMode
    chord.chordSize = priorSize
    chord.scaleSnap = priorSnap
  }
  chord.slots = slots
  chord.bank = bank
}

/** turn the current generated mapping into editable chord-memory slots */
export function bakeChordMapping(chord: ChordData): void {
  if (chord.mappingMode === 'memory') return
  const mode = chord.mappingMode
  chord.slots = Array.from({ length: CHORD_SLOTS }, (_, note) =>
    slot(mode === 'degree' ? degreeNotes(chord, note) : qualityNotes(chord, note)),
  )
  chord.mappingMode = 'memory'
  chord.bank = 'init'
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

/**
 * Steps elapsed on the transport. Trigger-relative resets are applied by the event simulation.
 */
export function patternStep(arp: ArpData, step: number): number {
  return step
}

/** the cell of a lane that is in play on a given step — each lane clocks itself */
export function laneIndex(arp: ArpData, key: LaneKey, step: number): number {
  const len = Math.max(1, arp.len[key])
  const div = Math.max(1, arp.div[key])
  return Math.floor(patternStep(arp, step) / div) % len
}

/** bars a lane takes to come back around to its first step against the bar grid */
export function laneWrapBars(arp: ArpData, key: LaneKey): number {
  const perCycle = stepsPerCycle(arp.rate)
  const span = Math.max(1, arp.len[key]) * Math.max(1, arp.div[key])
  return lcm(span, perCycle) / perCycle
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
function arpPeriod(
  arp: ArpData,
  chord: ChordData | null,
  perCycle: number,
  triggerPads?: (number | null)[],
  triggerStepsPerCycle = 1,
): number {
  // A sequenced chord changes once per bar; a live chord instead phase-shifts the complete pattern.
  let period = perCycle
  if (!(arp.retrig && (triggerPads?.length || chord?.progOn))) {
    period = lcm(perCycle, Math.max(1, arp.len.note) * Math.max(1, arp.div.note))
    for (const l of LANES) {
      if (l.key === 'note' || !laneActive(arp, l.key)) continue
      period = lcm(period, Math.max(1, arp.len[l.key]) * Math.max(1, arp.div[l.key]))
    }
  }
  if (triggerPads?.length) {
    const triggerPeriod = Math.max(1, Math.round((triggerPads.length * perCycle) / triggerStepsPerCycle))
    period = lcm(period, triggerPeriod)
  }
  else if (chord?.progOn) period = lcm(period, Math.max(1, chord.progLen) * perCycle)
  // coprime lane lengths can send the true period into the millions; truncating costs a phase
  // jump at the loop point, so the ceiling is generous enough that musical settings never hit it
  const cap = perCycle * Math.max(1, Math.floor(MAX_LOOP_STEPS / perCycle))
  return Math.min(period, cap)
}

/** step counter at a transport position — the emitted pattern always starts at cycle 0 */
export function stepAtCycle(arp: ArpData, cycle: number): number {
  return Math.floor(cycle * stepsPerCycle(arp.rate))
}

/** Note-lane phase used by the live editor, including the same retrigger boundaries as simulation. */
export function arpNoteStepAtCycle(arp: ArpData, cycle: number, chord: ChordData | null): number {
  const step = stepAtCycle(arp, cycle)
  if (!arp.retrig || !chord) return step
  const perCycle = stepsPerCycle(arp.rate)
  if (chord.progOn) return step % perCycle
  return Math.max(0, step - stepAtCycle(arp, chord.triggerCycle))
}

/** progression slot playing at a transport position, one bar per slot; -1 when it is off */
export function progSlotAtCycle(chord: ChordData, cycle: number): number {
  if (!chord.progOn) return -1
  const len = Math.max(1, chord.progLen)
  return ((Math.floor(cycle) % len) + len) % len
}

function padAt(
  chord: ChordData,
  step: number,
  perCycle: number,
  triggerPads?: (number | null)[],
  triggerStepsPerCycle = 1,
): number {
  if (triggerPads?.length) {
    const index = ((Math.floor((step * triggerStepsPerCycle) / perCycle) % triggerPads.length) + triggerPads.length) % triggerPads.length
    return triggerPads[index] ?? -1
  }
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

function simulate(
  arp: ArpData,
  chord: ChordData | null,
  perCycle: number,
  period: number,
  triggerPads?: (number | null)[],
  triggerStepsPerCycle = 1,
) {
  const events: StepEvent[] = []
  const fallback: Held = { notes: [48, 51, 55, 58], vel: [1, 1, 1, 1] }
  let pos = 0
  let last: StepEvent | null = null

  const retriggerEachChord = Boolean(arp.retrig && (triggerPads?.length || chord?.progOn))
  let retriggerStep = 0
  let previousPad: number | undefined
  for (let step = 0; step < period; step++) {
    const pad = chord ? padAt(chord, step, perCycle, triggerPads, triggerStepsPerCycle) : -1
    const chordChanged = triggerPads?.length
      ? step === 0 || pad !== previousPad
      : chord?.progOn && step % perCycle === 0
    if (retriggerEachChord && chordChanged) {
      pos = 0
      last = null
      retriggerStep = step
    }
    previousPad = pad
    const phaseStep = retriggerEachChord ? step - retriggerStep : step
    const idx = laneIndex(arp, 'note', phaseStep)
    const cell = arp.lanes.note[idx] ?? 0
    if (arp.mute[idx] || cell === 0) continue

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

    const rand = Math.round(laneValue(arp, 'rand', phaseStep))
    const lo = rand < 0 ? base + rand : base
    const hi = rand > 0 ? base + rand : base
    const octave = Math.round(laneValue(arp, 'octave', phaseStep))
    const semis = Math.round(laneValue(arp, 'pitch', phaseStep))
    const harmony = Math.round(laneValue(arp, 'harmony', phaseStep))
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
      gain:
        0.9 *
        laneValue(arp, 'vel', phaseStep) *
        (picked?.vel ?? 1) *
        (chord && !chord.progOn ? chord.triggerVelocity : 1),
      durSteps: Math.max(0.05, laneValue(arp, 'gate', phaseStep) * arp.globalGate),
      late: Math.max(-0.875, Math.min(0.875, laneValue(arp, 'late', phaseStep) + (phaseStep % 2 ? arp.swing : 0))),
    }
    events.push(ev)
    last = ev
  }

  return events
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

/** chord mode and random alternatives fatten every slot, so the loop shrinks rather than the code */
const MAX_CODE_CHARS = 12000

/**
 * Render the arp as `note(...)` with per-step gain and absolute durations.
 * Returns '' when nothing sounds.
 */
export function arpNoteCode(
  arp: ArpData,
  chord: ChordData | null,
  triggerPads?: (number | null)[],
  triggerStepsPerCycle = 1,
): string {
  const perCycle = stepsPerCycle(arp.rate)
  let period = arpPeriod(arp, chord, perCycle, triggerPads, triggerStepsPerCycle)
  let code = emit(arp, chord, perCycle, period, triggerPads, triggerStepsPerCycle)
  while (code.length > MAX_CODE_CHARS && period > perCycle) {
    period = perCycle * Math.max(1, Math.floor(period / perCycle / 2))
    code = emit(arp, chord, perCycle, period, triggerPads, triggerStepsPerCycle)
  }
  return code
}

function emit(
  arp: ArpData,
  chord: ChordData | null,
  perCycle: number,
  period: number,
  triggerPads?: (number | null)[],
  triggerStepsPerCycle = 1,
): string {
  const events = simulate(arp, chord, perCycle, period, triggerPads, triggerStepsPerCycle)
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
  if (arp.retrig && chord && !chord.progOn && !triggerPads?.length) code += `.late(${num(chord.triggerCycle)})`
  return code
}

/** the chord module on its own: block chords (optionally strummed), one per bar */
export function chordNoteCode(chord: ChordData, triggerPads?: (number | null)[]): string {
  const steps = triggerPads?.length
    ? triggerPads.map((pad) => pad ?? -1)
    : chord.progOn
    ? Array.from({ length: Math.max(1, chord.progLen) }, (_, i) => chord.prog[i] ?? -1)
    : [chord.current]

  const held = steps.map((pad) => (pad < 0 ? { notes: [], vel: [] } : heldNotes(chord, pad)))
  const width = Math.max(0, ...held.map((h) => h.notes.length))
  if (!width) return ''

  const layers: string[] = []
  for (let v = 0; v < width; v++) {
    const tokens = held.map((h) => (h.notes[v] == null ? '~' : midiName(h.notes[v])))
    if (tokens.every((t) => t === '~')) continue
    const inputVelocity = chord.progOn || triggerPads?.length ? 1 : chord.triggerVelocity
    const vels = held.map((h) => 0.9 * inputVelocity * (h.vel[v] ?? 1))
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
  return Math.max(0, Math.min(CHORD_SLOTS - 1, Math.round(note)))
}

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CHORD_SLOTS,
  ALL_CHORD_QUALITY_OPTIONS,
  ALL_SCALE_OPTIONS,
  applyChordBank,
  bakeChordMapping,
  arpNoteCode,
  captureArpPattern,
  chordNoteCode,
  defaultArpData,
  defaultChordData,
  heldNotes,
  laneIndex,
  padForMidi,
  selectArpPattern,
  shapeSeq,
  stepsPerCycle,
} from './chord-engine.ts'

test('defaults to live 128-slot chord memory', () => {
  const chord = defaultChordData()
  assert.equal(chord.slots.length, CHORD_SLOTS)
  assert.equal(chord.progOn, false)
  assert.equal(chord.current, 48)
  assert.deepEqual(heldNotes(chord, 48).notes, [48, 51, 55, 58])
})

test('exposes the complete installed scale and chord dictionaries', () => {
  assert.ok(ALL_SCALE_OPTIONS.length >= 90)
  assert.ok(ALL_CHORD_QUALITY_OPTIONS.length >= 80)
})

test('maps each MIDI note to its exact memory slot', () => {
  assert.equal(padForMidi(0), 0)
  assert.equal(padForMidi(60), 60)
  assert.equal(padForMidi(127), 127)
})

test('generates scale-degree seventh chords', () => {
  const chord = defaultChordData()
  chord.mappingMode = 'degree'
  chord.tonic = 'C'
  chord.scaleType = 'major'
  chord.chordSize = 4
  assert.deepEqual(heldNotes(chord, 62).notes, [62, 65, 69, 72])
  assert.deepEqual(heldNotes(chord, 61).notes, [])
  chord.scaleSnap = 'nearest'
  assert.deepEqual(heldNotes(chord, 61).notes, [60, 64, 67, 71])
})

test('turns an input root into the selected chord quality', () => {
  const chord = defaultChordData()
  chord.mappingMode = 'root-quality'
  chord.chordQuality = 'm9'
  assert.deepEqual(heldNotes(chord, 62).notes, [62, 65, 69, 72, 76])
})

test('bakes a generated mapping into editable memory', () => {
  const chord = defaultChordData()
  chord.mappingMode = 'root-quality'
  chord.chordQuality = 'm9'
  bakeChordMapping(chord)
  assert.equal(chord.mappingMode, 'memory')
  assert.deepEqual(heldNotes(chord, 62).notes, [62, 65, 69, 72, 76])
})

test('builds a complete chromatic memory bank', () => {
  const chord = defaultChordData()
  applyChordBank(chord, 'major-triads')
  assert.deepEqual(heldNotes(chord, 62).notes, [62, 66, 69])
  assert.deepEqual(heldNotes(chord, 100).notes, [100, 104, 107])
})

test('live velocity scales chord output and release can silence it', () => {
  const chord = defaultChordData()
  chord.triggerVelocity = 0.5
  assert.match(chordNoteCode(chord), /gain\(0\.45\)/)
  chord.current = -1
  assert.equal(chordNoteCode(chord), '')
})

test('live arp retrigger is phase-aligned to the trigger cycle', () => {
  const chord = defaultChordData()
  const arp = defaultArpData()
  arp.retrig = true
  chord.triggerCycle = 2.25
  assert.match(arpNoteCode(arp, chord), /\.late\(2\.25\)$/)
  chord.progOn = true
  assert.doesNotMatch(arpNoteCode(arp, chord), /\.late\(2\.25\)$/)
})

test('arp follows sub-cycle MIDI trigger state from a piano roll', () => {
  const chord = defaultChordData()
  chord.slots[60].voices = [60]
  chord.slots[62].voices = [62]
  const arp = defaultArpData()
  const triggers = [...Array(8).fill(60), ...Array(8).fill(62)]
  const code = arpNoteCode(arp, chord, triggers, 16)
  assert.match(code, /^note\("c4 c4 c4 c4 c4 c4 c4 c4 d4 d4 d4 d4 d4 d4 d4 d4"\)/)
})

test('arp patterns can be copied and recalled independently', () => {
  const arp = defaultArpData()
  arp.lanes.note[0] = 3
  selectArpPattern(arp, 1, true)
  arp.lanes.note[0] = 7
  selectArpPattern(arp, 0)
  assert.equal(arp.lanes.note[0], 3)
  assert.equal(captureArpPattern(arp).lanes.note[0], 3)
})

test('shape, lane, and expanded rate helpers remain deterministic', () => {
  assert.deepEqual(shapeSeq(2, 4), [0, 1, 2, 3, 2, 1])
  const arp = defaultArpData()
  arp.len.note = 3
  arp.div.note = 2
  assert.equal(laneIndex(arp, 'note', 7), 0)
  assert.equal(stepsPerCycle('1/128'), 128)
})

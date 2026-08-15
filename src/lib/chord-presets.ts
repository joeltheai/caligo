import { CHORD_SLOTS, VOICES, defaultChordData, type ChordData, type ChordSlot } from './chord-engine'

const STORAGE_KEY = 'caligo.chord-presets.v1'

export interface StoredChordPreset {
  schemaVersion: 1
  name: string
  savedAt: string
  chord: ChordData
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function readAll(): Record<string, StoredChordPreset> {
  const raw = storage()?.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function normalizeSlot(value?: Partial<ChordSlot>): ChordSlot {
  return {
    voices: Array.from({ length: VOICES }, (_, i) => value?.voices?.[i] ?? null),
    vel: Array.from({ length: VOICES }, (_, i) => value?.vel?.[i] ?? 1),
  }
}

export function normalizeChordPreset(value: ChordData): ChordData {
  const base = defaultChordData()
  const slots = Array.from({ length: CHORD_SLOTS }, (_, i) => normalizeSlot(value.slots?.[i]))
  return {
    ...base,
    ...value,
    slots,
    current: Number.isFinite(value.current) ? value.current : -1,
    selected: Number.isFinite(value.selected) ? value.selected : Math.max(0, value.current ?? 48),
    page: Math.floor((value.page ?? value.selected ?? 48) / 16) * 16,
    triggerVelocity: value.triggerVelocity ?? 1,
    triggerSerial: value.triggerSerial ?? 0,
    triggerCycle: value.triggerCycle ?? 0,
  }
}

export function listChordPresets(): string[] {
  return Object.keys(readAll()).sort((a, b) => a.localeCompare(b))
}

export function saveChordPreset(name: string, chord: ChordData): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const all = readAll()
  all[trimmed] = {
    schemaVersion: 1,
    name: trimmed,
    savedAt: new Date().toISOString(),
    chord: structuredClone(normalizeChordPreset(chord)),
  }
  storage()?.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadChordPreset(name: string): ChordData | null {
  const value = readAll()[name]
  return value?.schemaVersion === 1 ? normalizeChordPreset(structuredClone(value.chord)) : null
}

export function deleteChordPreset(name: string): void {
  const all = readAll()
  delete all[name]
  storage()?.setItem(STORAGE_KEY, JSON.stringify(all))
}

import { captureArpPattern, defaultArpData, type ArpData } from './chord-engine'

const STORAGE_KEY = 'caligo.arp-presets.v1'

interface StoredArpPreset {
  schemaVersion: 1
  name: string
  savedAt: string
  arp: ArpData
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function readAll(): Record<string, StoredArpPreset> {
  const raw = storage()?.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function normalizeArpPreset(value: ArpData): ArpData {
  const base = defaultArpData()
  const merged = { ...base, ...value }
  merged.patterns = Array.from({ length: 12 }, (_, i) =>
    structuredClone(value.patterns?.[i] ?? (i === value.pattern ? captureArpPattern(merged) : base.patterns[i])),
  )
  merged.patternNames = Array.from(
    { length: 12 },
    (_, i) => value.patternNames?.[i] || String.fromCharCode(65 + i),
  )
  return merged
}

export function listArpPresets(): string[] {
  return Object.keys(readAll()).sort((a, b) => a.localeCompare(b))
}

export function saveArpPreset(name: string, arp: ArpData): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const normalized = normalizeArpPreset(arp)
  normalized.patterns[normalized.pattern] = captureArpPattern(normalized)
  const all = readAll()
  all[trimmed] = {
    schemaVersion: 1,
    name: trimmed,
    savedAt: new Date().toISOString(),
    arp: structuredClone(normalized),
  }
  storage()?.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadArpPreset(name: string): ArpData | null {
  const value = readAll()[name]
  return value?.schemaVersion === 1 ? normalizeArpPreset(structuredClone(value.arp)) : null
}

export function deleteArpPreset(name: string): void {
  const all = readAll()
  delete all[name]
  storage()?.setItem(STORAGE_KEY, JSON.stringify(all))
}

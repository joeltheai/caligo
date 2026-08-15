import { WebMidi, type Input, type NoteMessageEvent, type PortEvent } from 'webmidi'

export interface MidiNoteEvent {
  type: 'noteon' | 'noteoff'
  note: number
  velocity: number
  channel: number
  timestamp: number
}

export type NoteHandler = (event: MidiNoteEvent) => void

const handlers = new Set<NoteHandler>()
let enabling: Promise<string | null> | null = null

function listen(input: Input) {
  input.addListener('noteon', (e: NoteMessageEvent) => {
    const event: MidiNoteEvent = {
      type: 'noteon',
      note: e.note.number,
      velocity: e.note.attack,
      channel: e.message.channel,
      timestamp: e.timestamp,
    }
    for (const h of handlers) h(event)
  })
  input.addListener('noteoff', (e: NoteMessageEvent) => {
    const event: MidiNoteEvent = {
      type: 'noteoff',
      note: e.note.number,
      velocity: e.note.release,
      channel: e.message.channel,
      timestamp: e.timestamp,
    }
    for (const h of handlers) h(event)
  })
}

/** Opens every MIDI input and keeps watching for devices plugged in later. */
export function enableMidi(): Promise<string | null> {
  if (!enabling) {
    enabling = (async () => {
      try {
        await WebMidi.enable()
        WebMidi.inputs.forEach(listen)
        WebMidi.addListener('connected', (e: PortEvent) => {
          if (e.port?.type === 'input') listen(e.port as Input)
        })
        return null
      } catch (err) {
        enabling = null
        return err instanceof Error ? err.message : 'no MIDI access'
      }
    })()
  }
  return enabling
}

export function onMidiNote(handler: NoteHandler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

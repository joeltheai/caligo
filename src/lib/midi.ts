import { WebMidi, type Input, type NoteMessageEvent, type PortEvent } from 'webmidi'

export type NoteHandler = (note: number, velocity: number) => void

const handlers = new Set<NoteHandler>()
let enabling: Promise<string | null> | null = null

function listen(input: Input) {
  input.addListener('noteon', (e: NoteMessageEvent) => {
    for (const h of handlers) h(e.note.number, e.note.attack)
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

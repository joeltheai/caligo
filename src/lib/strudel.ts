import type { StrudelRepl } from '@strudel/web'
import { prebake } from './prebake'

let ready: Promise<void> | null = null
let evaluateFn: ((code: string) => Promise<unknown>) | null = null
let hushFn: (() => void) | null = null
let scheduler: StrudelRepl['scheduler'] | null = null

export async function ensureStrudel() {
  if (!ready) {
    ready = (async () => {
      const web = await import('@strudel/web')
      const repl = await web.initStrudel({ prebake })
      evaluateFn = web.evaluate
      hushFn = web.hush
      scheduler = repl?.scheduler ?? null
    })().catch((err) => {
      // otherwise a transient failure (dev-server reload, offline CDN) sticks forever
      ready = null
      throw err
    })
  }
  await ready
}

export async function playCode(code: string) {
  await ensureStrudel()
  if (!code.trim()) {
    hushFn?.()
    return
  }
  await evaluateFn?.(code)
}

export function stopAudio() {
  hushFn?.()
}

/**
 * Where the transport is right now, in cycles, or null while stopped.
 * This already lines up with what you hear: the scheduler reports a position two
 * clock ticks behind, which cancels the 0.1s it schedules triggers ahead by.
 */
export function transportCycle(): number | null {
  if (!scheduler?.started) return null
  const cycle = scheduler.now()
  return Number.isFinite(cycle) ? cycle : null
}

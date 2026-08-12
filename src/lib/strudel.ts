import { prebake } from './prebake'

let ready: Promise<void> | null = null
let evaluateFn: ((code: string) => Promise<unknown>) | null = null
let hushFn: (() => void) | null = null

export async function ensureStrudel() {
  if (!ready) {
    ready = (async () => {
      const web = await import('@strudel/web')
      await web.initStrudel({ prebake })
      evaluateFn = web.evaluate
      hushFn = web.hush
    })()
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

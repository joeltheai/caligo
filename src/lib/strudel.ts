let ready: Promise<void> | null = null
let evaluateFn: ((code: string) => Promise<unknown>) | null = null
let hushFn: (() => void) | null = null

export async function ensureStrudel() {
  if (!ready) {
    ready = (async () => {
      const web = await import('@strudel/web')
      await web.initStrudel({
        // bd / sd / hh etc. need a sample map — synths alone aren't enough
        prebake: () => web.samples('github:tidalcycles/dirt-samples'),
      })
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

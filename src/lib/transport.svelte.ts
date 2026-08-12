import { transportCycle } from './strudel'

/**
 * Shared playhead, so every module editor can show what is sounding right now off
 * a single animation frame loop instead of one per module.
 */
export const clock = $state({ cycle: 0, running: false })

let frame = 0
let watchers = 0

function tick() {
  const cycle = transportCycle()
  clock.running = cycle != null
  if (cycle != null) clock.cycle = cycle
  frame = requestAnimationFrame(tick)
}

/** ticks while at least one editor is mounted — call from an `$effect` and return the result */
export function watchClock(): () => void {
  watchers += 1
  if (!frame) frame = requestAnimationFrame(tick)
  return () => {
    watchers -= 1
    if (watchers === 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
}

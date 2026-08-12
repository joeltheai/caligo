<script lang="ts">
  interface Props {
    value: number
    min?: number
    max?: number
    step?: number
    label?: string
    onChange?: (value: number) => void
  }

  let { value, min = 40, max = 240, step = 1, label = 'bpm', onChange }: Props = $props()

  let dragging = $state(false)
  let startY = 0
  let startVal = 0

  // sweep from -135° to +135°
  const angle = $derived(-135 + ((value - min) / (max - min)) * 270)

  function clamp(n: number) {
    const snapped = Math.round(n / step) * step
    return Math.min(max, Math.max(min, snapped))
  }

  function onDown(e: PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragging = true
    startY = e.clientY
    startVal = value
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return
    const dy = startY - e.clientY
    const range = max - min
    // ~120px full sweep
    onChange?.(clamp(startVal + (dy / 120) * range))
  }

  function onUp() {
    dragging = false
  }

  function onDblClick(e: MouseEvent) {
    e.stopPropagation()
    onChange?.(120)
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    e.stopPropagation()
    const dir = e.deltaY > 0 ? -1 : 1
    onChange?.(clamp(value + dir * step * (e.shiftKey ? 10 : 1)))
  }
</script>

<div
  class="pointer-events-auto flex flex-col items-center gap-0.5 border border-border bg-panel px-2 py-1.5 select-none"
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointercancel={onUp}
  ondblclick={onDblClick}
  onwheel={onWheel}
  role="slider"
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  tabindex="0"
  onkeydown={(e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault()
      onChange?.(clamp(value + step))
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault()
      onChange?.(clamp(value - step))
    }
  }}
>
  <div
    class="relative size-9 cursor-ns-resize rounded-full border border-border-strong bg-bg {dragging
      ? 'border-fg'
      : ''}"
  >
    <i
      class="pointer-events-none absolute top-1/2 left-1/2 block h-3.5 w-px origin-bottom bg-fg"
      style:transform="translate(-50%, -100%) rotate({angle}deg)"
    ></i>
  </div>
  <span class="text-[10px] leading-none text-muted">{label}</span>
  <em class="min-w-[2em] text-center text-[11px] not-italic text-fg-bright">{value}</em>
</div>

# caligo

Modular node patcher for browser-based sound design.

```sh
pnpm i
pnpm dev
```

- Right-click canvas → add module
- Drag out→in ports to cable
- Scroll zoom · alt-drag / middle-mouse pan
- LED toggles module on/off

## Chords + arp

A pad-and-grid workflow for building chords and arpeggios without typed patterns.

- **CHORDS** — 16 pads, 8 voices each. Drag a voice to change its pitch, drag its bar for level,
  `▪` locks it as a pedal tone across pads. Trigger pads by clicking, by the `asdf/zxcv` keys, or
  over MIDI. The progression lane loops pads over N bars; turn it off to latch one pad by hand.
- **ARP** — eight step lanes (note, rand, oct, pitch, vel, gate, late, harmony), each with its own
  length and clock divider, so lanes drift against each other polymetrically. Click a step to mute,
  shift-click to tie into the previous step, alt-click to reset the note position. A step is an
  absolute 1/16 (or whatever `rate` says), so a lane whose length does not divide the bar runs over
  the bar line and comes back around later — the readout tells you how many bars that takes.
  `retrig` restarts every lane on each chord.
- **VOICE** — picks the synth (and attack/release) for notes arriving from CHORDS or ARP. The note
  modules only emit notes, so the instrument is a module you cable them into.

While the transport runs, both editors light up what is sounding right now — the step each lane is
on, and the pad the progression has reached.

Cable CHORDS → ARP → VOICE to arpeggiate a pad; skip the ARP to play block chords.

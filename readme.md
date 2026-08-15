# caligo

Modular node patcher for browser-based sound design.

The note modules support a playable chord-memory and pattern workflow:

- **CHORDS** maps trigger notes through 128 editable memory slots, scale-degree harmony, or a
  fixed chord quality. It also supports MIDI input, keyboard input, latch, chord learning,
  generated banks, voicings, inversions, and browser-local presets.
- **ARP** reshapes incoming chords with eight independent step lanes, 12 named pattern slots,
  per-lane length/division, retrigger, swing, gate, harmony, and pitch constraints.
- **VOICE** assigns an instrument to the resulting notes.

```sh
pnpm i
pnpm dev
```

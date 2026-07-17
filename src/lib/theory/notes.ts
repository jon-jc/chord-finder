/** Pitch, note-name, and frequency helpers. */

export const PITCH_CLASSES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export const PITCH_CLASSES_FLAT = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export const A4_MIDI = 69;
export const A4_FREQ = 440;

export function midiToFreq(midi: number, tuningCents = 0): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI + tuningCents / 100) / 12);
}

export function freqToMidi(freq: number, tuningCents = 0): number {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ) - tuningCents / 100;
}

export function midiToNoteName(midi: number, preferFlats = false): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = preferFlats ? PITCH_CLASSES_FLAT[pc] : PITCH_CLASSES[pc];
  return `${name}${octave}`;
}

export function pitchClassName(pc: number, preferFlats = false): string {
  const idx = ((pc % 12) + 12) % 12;
  return preferFlats ? PITCH_CLASSES_FLAT[idx] : PITCH_CLASSES[idx];
}

/** Keys whose conventional spelling uses flats (for display purposes). */
const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db
const FLAT_MINOR_TONICS = new Set([2, 7, 0, 5, 10]); // d, g, c, f, bb

export function keyPrefersFlats(tonic: number, mode: "major" | "minor"): boolean {
  const pc = ((tonic % 12) + 12) % 12;
  return mode === "major" ? FLAT_MAJOR_TONICS.has(pc) : FLAT_MINOR_TONICS.has(pc);
}

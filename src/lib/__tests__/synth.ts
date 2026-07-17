/** Test-only audio synthesis helpers. */

import { midiToFreq } from "../theory/notes";

export const TEST_SAMPLE_RATE = 22050;

/**
 * Render a set of MIDI notes as summed harmonics-rich tones (fundamental +
 * decaying overtones), roughly imitating a plucked/struck timbre.
 */
export function renderNotes(
  midiNotes: number[],
  seconds: number,
  sampleRate = TEST_SAMPLE_RATE,
  detuneCents = 0
): Float32Array {
  const length = Math.floor(seconds * sampleRate);
  const out = new Float32Array(length);
  for (const midi of midiNotes) {
    const f0 = midiToFreq(midi, detuneCents);
    for (let h = 1; h <= 5; h++) {
      const freq = f0 * h;
      if (freq > sampleRate / 2) break;
      const amp = 0.3 / (midiNotes.length * h);
      const phase = Math.random() * 2 * Math.PI;
      for (let i = 0; i < length; i++) {
        // Gentle exponential decay for realism.
        const env = Math.exp((-1.5 * i) / sampleRate);
        out[i] += amp * env * Math.sin((2 * Math.PI * freq * i) / sampleRate + phase);
      }
    }
  }
  return out;
}

/** Concatenate several PCM buffers. */
export function concat(buffers: Float32Array[]): Float32Array {
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

/** MIDI note numbers for a chord built on a root (octave 3/4 voicing). */
export function chordMidiNotes(rootPc: number, intervals: number[]): number[] {
  const rootMidi = 48 + rootPc; // C3 = 48
  return intervals.map((iv) => rootMidi + iv);
}

/** Add white noise to a signal at the given linear amplitude. */
export function addNoise(signal: Float32Array, amplitude: number): Float32Array {
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    out[i] = signal[i] + (Math.random() * 2 - 1) * amplitude;
  }
  return out;
}

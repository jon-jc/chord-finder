/**
 * Polyphonic pitch estimation for a short audio segment via iterative
 * harmonic-salience maximization with spectral subtraction.
 */

import { magnitudeSpectrum } from "../dsp/fft";
import { applyHann } from "../dsp/window";
import { midiToFreq } from "../theory/notes";

export interface EstimatedPitch {
  midi: number;
  /** Relative strength within the segment, 0..1. */
  strength: number;
}

export interface PitchOptions {
  minMidi?: number;
  maxMidi?: number;
  maxPolyphony?: number;
  harmonics?: number;
  harmonicDecay?: number;
  /** Stop when the next candidate is weaker than this fraction of the first. */
  stopRatio?: number;
  tuningCents?: number;
}

const DEFAULTS: Required<PitchOptions> = {
  minMidi: 40, // E2, lowest standard-tuning guitar note
  maxMidi: 88, // E6
  maxPolyphony: 6,
  harmonics: 6,
  harmonicDecay: 0.75,
  stopRatio: 0.22,
  tuningCents: 0,
};

/** Max spectrum magnitude within +-`cents` of `freq` (0 if out of range). */
function bandMax(
  spectrum: Float32Array,
  binHz: number,
  freq: number,
  cents: number
): { value: number; bin: number } {
  const low = freq * Math.pow(2, -cents / 1200);
  const high = freq * Math.pow(2, cents / 1200);
  let from = Math.max(1, Math.floor(low / binHz));
  let to = Math.min(spectrum.length - 1, Math.ceil(high / binHz));
  if (to < from) [from, to] = [to, from];
  let best = 0;
  let bestBin = -1;
  for (let i = from; i <= to; i++) {
    if (spectrum[i] > best) {
      best = spectrum[i];
      bestBin = i;
    }
  }
  return { value: best, bin: bestBin };
}

/**
 * Estimate the notes sounding in `segment` (mono PCM). Uses the attack
 * portion, where harmonics are strongest.
 */
export function estimatePitches(
  segment: Float32Array,
  sampleRate: number,
  options: PitchOptions = {}
): EstimatedPitch[] {
  const opts = { ...DEFAULTS, ...options };

  // Analysis window: up to 8192 samples from the segment start.
  const size = Math.min(8192, 1 << Math.floor(Math.log2(Math.max(2, segment.length))));
  if (size < 2048) return [];
  const windowed = new Float32Array(size);
  applyHann(segment.subarray(0, size), windowed);
  const spectrum = magnitudeSpectrum(windowed);
  const binHz = sampleRate / size;

  let maxMag = 0;
  for (let i = 0; i < spectrum.length; i++) {
    if (spectrum[i] > maxMag) maxMag = spectrum[i];
  }
  if (maxMag <= 0) return [];
  const fundamentalGate = maxMag * 0.02;

  const working = Float32Array.from(spectrum);
  const results: EstimatedPitch[] = [];
  let firstSalience = 0;

  for (let iteration = 0; iteration < opts.maxPolyphony; iteration++) {
    let bestMidi = -1;
    let bestSalience = 0;

    for (let midi = opts.minMidi; midi <= opts.maxMidi; midi++) {
      if (results.some((r) => r.midi === midi)) continue;
      const f0 = midiToFreq(midi, opts.tuningCents);
      if (f0 * 2 > sampleRate / 2) break;

      // Require some energy at the fundamental itself (guards against
      // sub-octave ghosts assembled purely from even harmonics).
      const fundamental = bandMax(working, binHz, f0, 40);
      if (fundamental.value < fundamentalGate) continue;

      let salience = 0;
      for (let h = 1; h <= opts.harmonics; h++) {
        const freq = f0 * h;
        if (freq > sampleRate / 2) break;
        const band = bandMax(working, binHz, freq, 35);
        salience += Math.pow(opts.harmonicDecay, h - 1) * band.value;
      }
      if (salience > bestSalience) {
        bestSalience = salience;
        bestMidi = midi;
      }
    }

    if (bestMidi < 0) break;
    if (iteration === 0) {
      firstSalience = bestSalience;
    } else if (bestSalience < firstSalience * opts.stopRatio) {
      break;
    }

    results.push({ midi: bestMidi, strength: bestSalience });

    // Subtract this note's harmonics so weaker notes can surface.
    const f0 = midiToFreq(bestMidi, opts.tuningCents);
    for (let h = 1; h <= opts.harmonics + 2; h++) {
      const freq = f0 * h;
      if (freq > sampleRate / 2) break;
      const low = Math.max(1, Math.floor((freq * Math.pow(2, -45 / 1200)) / binHz));
      const high = Math.min(
        working.length - 1,
        Math.ceil((freq * Math.pow(2, 45 / 1200)) / binHz)
      );
      for (let i = low; i <= high; i++) working[i] *= 0.15;
    }
  }

  const peak = results.reduce((m, r) => Math.max(m, r.strength), 0) || 1;
  return results
    .map((r) => ({ midi: r.midi, strength: r.strength / peak }))
    .sort((a, b) => a.midi - b.midi);
}

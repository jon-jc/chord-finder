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
  /**
   * Raw (un-normalized) harmonic salience. Comparable across segments of
   * the same recording; used to tell re-attacks from ring-over.
   */
  salience: number;
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
  /**
   * Pitch classes of the chord sounding in this segment. Chord tones get a
   * mild salience boost and non-chord tones a mild penalty, so borderline
   * candidates resolve toward what the harmony says is plausible.
   */
  preferredPcs?: number[];
}

const DEFAULTS: Required<PitchOptions> = {
  minMidi: 40, // E2, lowest standard-tuning guitar note
  maxMidi: 88, // E6
  maxPolyphony: 6,
  harmonics: 6,
  harmonicDecay: 0.75,
  stopRatio: 0.22,
  tuningCents: 0,
  preferredPcs: [],
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
 * Estimate the notes sounding in `segment` (mono PCM).
 *
 * Analyzes the attack portion (strongest harmonics) and — when the segment
 * is long enough — a second window from the sustain, averaging the two
 * normalized spectra. Attack transients (pick noise, hammer thump) are
 * broadband and incoherent between the windows, so they wash out, while
 * true partials reinforce.
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

  if (segment.length >= size + size / 2) {
    // Second window from the sustain portion, blended 60/40 in raw
    // magnitude (same window size, so the scales match). Attack transients
    // are incoherent between the windows and wash out; true partials
    // reinforce.
    const offset = Math.min(segment.length - size, Math.floor(size / 2));
    applyHann(segment.subarray(offset, offset + size), windowed);
    const sustain = magnitudeSpectrum(windowed);
    for (let i = 0; i < spectrum.length; i++) {
      spectrum[i] = 0.6 * spectrum[i] + 0.4 * sustain[i];
    }
  }

  // Magnitudes scale with window size; normalize so saliences are
  // comparable across segments of different lengths (ring-over tracking
  // depends on this).
  const sizeScale = 8192 / size;
  for (let i = 0; i < spectrum.length; i++) spectrum[i] *= sizeScale;

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
      let presentEarly = 0;
      for (let h = 1; h <= opts.harmonics; h++) {
        const freq = f0 * h;
        if (freq > sampleRate / 2) break;
        const band = bandMax(working, binHz, freq, 35);
        if (h <= 3 && band.value > fundamentalGate) presentEarly++;
        salience += Math.pow(opts.harmonicDecay, h - 1) * band.value;
      }
      // A real note shows at least two of its first three partials; a lone
      // spectral peak (noise, residue of a subtracted note) does not.
      if (presentEarly < 2) continue;

      if (opts.preferredPcs.length > 0) {
        const pc = ((midi % 12) + 12) % 12;
        salience *= opts.preferredPcs.includes(pc) ? 1.18 : 0.86;
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

    results.push({ midi: bestMidi, strength: bestSalience, salience: bestSalience });

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

  // Sub-octave ghost filter: a pitch one octave below a much stronger
  // detection is usually assembled from that note's own partials (every
  // even harmonic coincides). Real octave doublings ring comparably loud
  // on the lower string and survive.
  const filtered = results.filter((r) => {
    const upper = results.find((r2) => r2.midi === r.midi + 12);
    return !upper || r.salience >= 0.4 * upper.salience;
  });

  const peak = filtered.reduce((m, r) => Math.max(m, r.strength), 0) || 1;
  return filtered
    .map((r) => ({ midi: r.midi, strength: r.strength / peak, salience: r.salience }))
    .sort((a, b) => a.midi - b.midi);
}

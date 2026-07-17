/**
 * Chromagram extraction.
 *
 * Pipeline per frame:
 *   Hann window -> FFT -> spectral peak picking with quadratic interpolation
 *   -> tuning-corrected mapping of peaks onto 12 pitch classes.
 *
 * Peaks are mapped directly to their own pitch class (no subharmonic
 * folding — instrument harmonics are instead modeled in the chord templates,
 * which keeps the chroma sharp). Peak magnitudes are square-root compressed
 * so a loud bass note cannot drown out the rest of the chord.
 *
 * A global tuning offset is estimated from the peak deviations so slightly
 * detuned recordings still land on the right pitch classes.
 */

import { magnitudeSpectrum } from "./fft";
import { applyHann } from "./window";
import { freqToMidi } from "../theory/notes";

export interface ChromaFrame {
  /** 12 pitch-class energies, L2-normalized (all zeros for silent frames). */
  chroma: Float32Array;
  /** RMS of the raw frame, used for silence gating. */
  rms: number;
  /** Frame start time in seconds. */
  time: number;
}

export interface ChromagramResult {
  frames: ChromaFrame[];
  /** Estimated tuning deviation from A440 in cents, in [-50, 50). */
  tuningCents: number;
  hopSeconds: number;
  frameSeconds: number;
}

export interface ChromaOptions {
  frameSize?: number;
  hopSize?: number;
  minFreq?: number;
  maxFreq?: number;
  /** Exponent applied to peak magnitudes (dynamic-range compression). */
  peakCompression?: number;
}

interface SpectralPeak {
  freq: number;
  magnitude: number;
}

const DEFAULTS: Required<ChromaOptions> = {
  frameSize: 8192,
  hopSize: 2048,
  minFreq: 55, // A1
  maxFreq: 2200,
  peakCompression: 0.5,
};

/**
 * Pick local maxima of the magnitude spectrum between minFreq and maxFreq,
 * refining frequency and magnitude with quadratic (parabolic) interpolation.
 */
function findPeaks(
  spectrum: Float32Array,
  sampleRate: number,
  frameSize: number,
  minFreq: number,
  maxFreq: number,
  threshold: number
): SpectralPeak[] {
  const binHz = sampleRate / frameSize;
  const start = Math.max(2, Math.floor(minFreq / binHz));
  const end = Math.min(spectrum.length - 2, Math.ceil(maxFreq / binHz));
  const peaks: SpectralPeak[] = [];

  for (let i = start; i <= end; i++) {
    const mag = spectrum[i];
    if (mag <= threshold) continue;
    if (mag <= spectrum[i - 1] || mag < spectrum[i + 1]) continue;

    // Parabolic interpolation in the log-magnitude domain.
    const alpha = Math.log(spectrum[i - 1] + 1e-12);
    const beta = Math.log(mag + 1e-12);
    const gamma = Math.log(spectrum[i + 1] + 1e-12);
    const denom = alpha - 2 * beta + gamma;
    const offset = denom === 0 ? 0 : (0.5 * (alpha - gamma)) / denom;
    const clamped = Math.max(-0.5, Math.min(0.5, offset));
    peaks.push({
      freq: (i + clamped) * binHz,
      magnitude: Math.exp(beta - 0.25 * clamped * (alpha - gamma)),
    });
  }
  return peaks;
}

/**
 * Estimate global tuning offset in cents from all detected peaks using a
 * resultant-vector average of deviations on the cents-circle (period 100).
 */
function estimateTuning(allPeaks: SpectralPeak[][]): number {
  let sumSin = 0;
  let sumCos = 0;
  for (const framePeaks of allPeaks) {
    for (const peak of framePeaks) {
      const midi = freqToMidi(peak.freq);
      const deviation = midi - Math.round(midi); // in [-0.5, 0.5) semitones
      const angle = deviation * 2 * Math.PI;
      const weight = Math.sqrt(peak.magnitude);
      sumSin += weight * Math.sin(angle);
      sumCos += weight * Math.cos(angle);
    }
  }
  if (sumSin === 0 && sumCos === 0) return 0;
  const meanAngle = Math.atan2(sumSin, sumCos);
  return (meanAngle / (2 * Math.PI)) * 100; // cents
}

/**
 * Compute the chromagram of a mono PCM signal.
 */
export function computeChromagram(
  signal: Float32Array,
  sampleRate: number,
  options: ChromaOptions = {}
): ChromagramResult {
  const opts = { ...DEFAULTS, ...options };
  const { frameSize, hopSize, minFreq, maxFreq, peakCompression } = opts;

  const frameCount = Math.max(0, Math.floor((signal.length - frameSize) / hopSize) + 1);
  const windowed = new Float32Array(frameSize);
  const peaksPerFrame: SpectralPeak[][] = [];
  const rmsPerFrame = new Float32Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    const frame = signal.subarray(f * hopSize, f * hopSize + frameSize);

    let sumSquares = 0;
    for (let i = 0; i < frameSize; i++) sumSquares += frame[i] * frame[i];
    rmsPerFrame[f] = Math.sqrt(sumSquares / frameSize);

    applyHann(frame, windowed);
    const spectrum = magnitudeSpectrum(windowed);

    let maxMag = 0;
    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i] > maxMag) maxMag = spectrum[i];
    }
    const threshold = maxMag * 0.01;
    peaksPerFrame.push(
      findPeaks(spectrum, sampleRate, frameSize, minFreq, maxFreq, threshold)
    );
  }

  const tuningCents = estimateTuning(peaksPerFrame);

  const frames: ChromaFrame[] = [];
  for (let f = 0; f < frameCount; f++) {
    const chroma = new Float32Array(12);
    for (const peak of peaksPerFrame[f]) {
      const midi = freqToMidi(peak.freq, tuningCents);
      const nearest = Math.round(midi);
      const centsOff = Math.abs(midi - nearest);
      if (centsOff > 0.35) continue; // reject inharmonic/ambiguous peaks
      const pc = ((nearest % 12) + 12) % 12;
      const proximity = 1 - centsOff / 0.5;
      chroma[pc] += Math.pow(peak.magnitude, peakCompression) * proximity;
    }

    // L2 normalize.
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
    if (norm > 0) {
      norm = Math.sqrt(norm);
      for (let i = 0; i < 12; i++) chroma[i] /= norm;
    }

    frames.push({
      chroma,
      rms: rmsPerFrame[f],
      time: (f * hopSize) / sampleRate,
    });
  }

  return {
    frames,
    tuningCents,
    hopSeconds: hopSize / sampleRate,
    frameSeconds: frameSize / sampleRate,
  };
}

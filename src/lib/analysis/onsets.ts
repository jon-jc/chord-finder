/**
 * Onset detection via spectral flux, plus tempo estimation from the
 * autocorrelation of the flux envelope.
 */

import { magnitudeSpectrum } from "../dsp/fft";
import { applyHann } from "../dsp/window";

export interface OnsetResult {
  /** Onset times in seconds, ascending. */
  onsets: number[];
  /** Spectral flux envelope (for visualization/debugging). */
  flux: Float32Array;
  hopSeconds: number;
  /** Estimated tempo in BPM (0 if too little evidence). */
  tempoBpm: number;
}

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;

export function detectOnsets(
  signal: Float32Array,
  sampleRate: number
): OnsetResult {
  const frameCount = Math.max(
    0,
    Math.floor((signal.length - FRAME_SIZE) / HOP_SIZE) + 1
  );
  const hopSeconds = HOP_SIZE / sampleRate;
  const flux = new Float32Array(frameCount);

  const windowed = new Float32Array(FRAME_SIZE);
  const energy = new Float32Array(frameCount);
  let previous: Float32Array | null = null;

  for (let f = 0; f < frameCount; f++) {
    const frame = signal.subarray(f * HOP_SIZE, f * HOP_SIZE + FRAME_SIZE);
    applyHann(frame, windowed);
    const spectrum = magnitudeSpectrum(windowed);

    let total = 0;
    for (let i = 0; i < spectrum.length; i++) total += spectrum[i];
    energy[f] = total;

    if (previous) {
      let sum = 0;
      for (let i = 0; i < spectrum.length; i++) {
        const diff = spectrum[i] - previous[i];
        if (diff > 0) sum += diff;
      }
      flux[f] = sum;
    }
    previous = spectrum;
  }

  // Normalize flux to its 95th percentile so thresholds are level-invariant.
  const sorted = Array.from(flux).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  let maxFlux = 0;
  for (let f = 0; f < frameCount; f++) {
    flux[f] /= p95;
    if (flux[f] > maxFlux) maxFlux = flux[f];
  }

  // Adaptive threshold: local mean over +-8 frames plus a fixed delta, and a
  // global significance gate so low-level wobble (e.g. beating between the
  // partials of a sustained chord) is never mistaken for an attack.
  const onsets: number[] = [];
  const meanWindow = 8;
  const minGapFrames = Math.round(0.1 / hopSeconds);
  const significance = maxFlux * 0.12;
  let lastOnsetFrame = -minGapFrames;

  for (let f = 1; f < frameCount - 1; f++) {
    const start = Math.max(0, f - meanWindow);
    const end = Math.min(frameCount, f + meanWindow + 1);
    let mean = 0;
    for (let i = start; i < end; i++) mean += flux[i];
    mean /= end - start;

    const threshold = Math.max(mean * 1.4 + 0.05, significance);
    const isPeak =
      flux[f] > threshold && flux[f] >= flux[f - 1] && flux[f] > flux[f + 1];
    if (isPeak && f - lastOnsetFrame >= minGapFrames) {
      onsets.push(f * hopSeconds);
      lastOnsetFrame = f;
    }
  }

  // Spectral flux cannot see a note that starts at sample 0 (there is no
  // previous frame to differ from). If the audio is already sounding before
  // the first detected onset, insert one at the first energetic frame.
  let maxEnergy = 0;
  for (let f = 0; f < frameCount; f++) {
    if (energy[f] > maxEnergy) maxEnergy = energy[f];
  }
  if (maxEnergy > 0) {
    let firstAudible = -1;
    for (let f = 0; f < frameCount; f++) {
      if (energy[f] > maxEnergy * 0.05) {
        firstAudible = f;
        break;
      }
    }
    if (
      firstAudible >= 0 &&
      (onsets.length === 0 || onsets[0] - firstAudible * hopSeconds > 0.15)
    ) {
      onsets.unshift(firstAudible * hopSeconds);
    }
  }

  return { onsets, flux, hopSeconds, tempoBpm: estimateTempo(flux, hopSeconds) };
}

/**
 * Tempo from the autocorrelation of the (mean-removed) flux envelope,
 * searching 60-200 BPM with a mild preference for moderate tempos.
 */
function estimateTempo(flux: Float32Array, hopSeconds: number): number {
  const n = flux.length;
  if (n < 64) return 0;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += flux[i];
  mean /= n;
  const centered = new Float32Array(n);
  for (let i = 0; i < n; i++) centered[i] = flux[i] - mean;

  const minLag = Math.round(60 / 200 / hopSeconds); // 200 BPM
  const maxLag = Math.round(60 / 60 / hopSeconds); // 60 BPM
  let bestLag = 0;
  let bestScore = 0;

  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += centered[i] * centered[i + lag];
    const bpm = 60 / (lag * hopSeconds);
    // Gentle log-normal weighting centered near 120 BPM.
    const weight = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 1.0, 2));
    const score = sum * weight;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestScore <= 0) return 0;
  return Math.round((60 / (bestLag * hopSeconds)) * 10) / 10;
}

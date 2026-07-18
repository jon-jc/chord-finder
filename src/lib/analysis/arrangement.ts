/**
 * Arrangement classification: is this a clean solo-instrument recording
 * (note-level transcription is trustworthy) or a dense mix — drums,
 * vocals, several instruments — where note-level transcription of the
 * mixture cannot reflect any single part?
 *
 * Measured via spectral flatness (geometric / arithmetic mean of the power
 * spectrum): plucked/struck solo instruments are extremely peaky (near 0),
 * while percussion, voice consonants, and layered instruments fill the
 * spectrum between the peaks and push flatness up.
 */

import { magnitudeSpectrum } from "../dsp/fft";
import { applyHann } from "../dsp/window";

export type ArrangementMode = "solo" | "dense";

export interface Arrangement {
  mode: ArrangementMode;
  /** Median spectral flatness across sampled frames, 0 (tonal) .. 1 (noise). */
  density: number;
}

const FRAME_SIZE = 4096;
const SAMPLE_FRAMES = 48;
const BAND_LOW_HZ = 100;
const BAND_HIGH_HZ = 4000;
/**
 * Above this median flatness the audio is treated as a dense mix.
 * Calibrated against synthesized material: clean plucked tones measure
 * ~1e-3 even with tape-hiss-level noise; adding drum-style noise bursts
 * pushes past 0.025. Real solo recordings sit below ~0.01, full-band
 * mixes well above 0.03.
 */
export const DENSE_THRESHOLD = 0.02;

export function classifyArrangement(
  signal: Float32Array,
  sampleRate: number
): Arrangement {
  const frameCount = Math.floor(signal.length / FRAME_SIZE);
  if (frameCount < 4) return { mode: "solo", density: 0 };

  const step = Math.max(1, Math.floor(frameCount / SAMPLE_FRAMES));
  const windowed = new Float32Array(FRAME_SIZE);
  const binHz = sampleRate / FRAME_SIZE;
  const lowBin = Math.max(1, Math.floor(BAND_LOW_HZ / binHz));
  const highBin = Math.min(
    Math.floor(FRAME_SIZE / 2),
    Math.ceil(BAND_HIGH_HZ / binHz)
  );

  // Skip frames with almost no energy (silence tells us nothing).
  const flatnessValues: number[] = [];
  let maxRms = 0;
  const frameRms: number[] = [];
  for (let f = 0; f + 1 <= frameCount; f += step) {
    const frame = signal.subarray(f * FRAME_SIZE, (f + 1) * FRAME_SIZE);
    let sumSquares = 0;
    for (let i = 0; i < FRAME_SIZE; i++) sumSquares += frame[i] * frame[i];
    const rms = Math.sqrt(sumSquares / FRAME_SIZE);
    frameRms.push(rms);
    maxRms = Math.max(maxRms, rms);
  }
  const rmsGate = maxRms * 0.1;

  let index = 0;
  for (let f = 0; f + 1 <= frameCount; f += step, index++) {
    if (frameRms[index] < rmsGate) continue;
    const frame = signal.subarray(f * FRAME_SIZE, (f + 1) * FRAME_SIZE);
    applyHann(frame, windowed);
    const spectrum = magnitudeSpectrum(windowed);

    let logSum = 0;
    let sum = 0;
    let bins = 0;
    for (let b = lowBin; b <= highBin; b++) {
      const power = spectrum[b] * spectrum[b] + 1e-12;
      logSum += Math.log(power);
      sum += power;
      bins++;
    }
    const geometric = Math.exp(logSum / bins);
    const arithmetic = sum / bins;
    flatnessValues.push(arithmetic > 0 ? geometric / arithmetic : 0);
  }

  if (flatnessValues.length === 0) return { mode: "solo", density: 0 };
  flatnessValues.sort((a, b) => a - b);
  const density = flatnessValues[Math.floor(flatnessValues.length / 2)];
  return { mode: density > DENSE_THRESHOLD ? "dense" : "solo", density };
}

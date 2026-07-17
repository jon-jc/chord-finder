/**
 * Musical key detection.
 *
 * Two blended sources of evidence:
 *  1. Profile correlation — the energy-weighted average chroma is correlated
 *     with rotated key profiles. Two well-studied profile sets
 *     (Krumhansl-Kessler probe-tone data and Temperley's revised profiles)
 *     are averaged, which is more robust than either alone.
 *  2. Chord-sequence evidence (optional) — how much of the decoded chord
 *     progression is diatonic to each candidate key, duration-weighted, with
 *     extra weight on tonic/subdominant/dominant functions.
 *
 * A windowed variant detects modulations over time.
 */

import { keyPrefersFlats, pitchClassName } from "./notes";

// Krumhansl & Kessler (1982) probe-tone profiles.
const KK_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KK_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

// Temperley (2001) revised profiles.
const TEMPERLEY_MAJOR = [
  5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0,
];
const TEMPERLEY_MINOR = [
  5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0,
];

export interface KeyEstimate {
  tonic: number; // pitch class 0-11
  mode: "major" | "minor";
  name: string; // e.g. "G major"
  /** Blended profile correlation of the winning key, in [-1, 1]. */
  correlation: number;
  /** Winner score minus runner-up score; higher = more certain. */
  confidence: number;
  preferFlats: boolean;
  /** All 24 candidates sorted best-first (for display). */
  alternatives: { name: string; correlation: number }[];
}

/** A stretch of audio governed by one local key (modulation tracking). */
export interface KeySpan {
  startTime: number;
  endTime: number;
  tonic: number;
  mode: "major" | "minor";
  name: string;
}

function pearson(x: ArrayLike<number>, profile: number[], rotation: number): number {
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < 12; i++) {
    sumX += x[i];
    sumY += profile[i];
  }
  const meanX = sumX / 12;
  const meanY = sumY / 12;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < 12; i++) {
    // profile index i corresponds to pitch class (i + rotation) mod 12
    const dx = x[(i + rotation) % 12] - meanX;
    const dy = profile[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function displayName(tonic: number, mode: "major" | "minor"): string {
  return `${pitchClassName(tonic, keyPrefersFlats(tonic, mode))} ${mode}`;
}

/** Index of a (tonic, mode) candidate in a 24-element evidence array. */
export function keyIndex(tonic: number, mode: "major" | "minor"): number {
  return tonic * 2 + (mode === "minor" ? 1 : 0);
}

/**
 * @param aggregateChroma 12-dim summed/averaged chroma over the piece
 * @param chordEvidence optional 24-dim per-key support from the decoded
 *   chord sequence, indexed by keyIndex(); any scale (normalized internally)
 */
export function detectKey(
  aggregateChroma: ArrayLike<number>,
  chordEvidence?: ArrayLike<number>
): KeyEstimate {
  let maxEvidence = 0;
  if (chordEvidence) {
    for (let i = 0; i < 24; i++) {
      maxEvidence = Math.max(maxEvidence, chordEvidence[i]);
    }
  }
  const evidenceWeight = chordEvidence && maxEvidence > 0 ? 0.35 : 0;

  const candidates: {
    tonic: number;
    mode: "major" | "minor";
    correlation: number;
    score: number;
  }[] = [];

  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"] as const) {
      const majorProfiles = mode === "major";
      const correlation =
        0.5 * pearson(aggregateChroma, majorProfiles ? KK_MAJOR : KK_MINOR, tonic) +
        0.5 *
          pearson(
            aggregateChroma,
            majorProfiles ? TEMPERLEY_MAJOR : TEMPERLEY_MINOR,
            tonic
          );
      const evidence =
        evidenceWeight > 0 && chordEvidence
          ? chordEvidence[keyIndex(tonic, mode)] / maxEvidence
          : 0;
      candidates.push({
        tonic,
        mode,
        correlation,
        score: (1 - evidenceWeight) * correlation + evidenceWeight * evidence,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const runnerUp = candidates[1];

  return {
    tonic: best.tonic,
    mode: best.mode,
    name: displayName(best.tonic, best.mode),
    correlation: best.correlation,
    confidence: best.score - runnerUp.score,
    preferFlats: keyPrefersFlats(best.tonic, best.mode),
    alternatives: candidates.slice(0, 5).map((c) => ({
      name: displayName(c.tonic, c.mode),
      correlation: c.score,
    })),
  };
}

export interface KeyTimelineOptions {
  /** Analysis window length in seconds. */
  windowSeconds?: number;
  /** Hop between windows in seconds. */
  hopSeconds?: number;
  /** Local key changes shorter than this are absorbed. */
  minSpanSeconds?: number;
}

/**
 * Windowed key detection over chroma frames -> modulation timeline.
 * Returns one span for non-modulating audio.
 */
export function detectKeyTimeline(
  frames: { chroma: Float32Array; rms: number; time: number }[],
  duration: number,
  options: KeyTimelineOptions = {}
): KeySpan[] {
  const {
    windowSeconds = 12,
    hopSeconds = 3,
    minSpanSeconds = 8,
  } = options;

  if (frames.length === 0 || duration <= 0) return [];

  interface WindowKey {
    center: number;
    tonic: number;
    mode: "major" | "minor";
  }

  // Window centers spanning the piece; every region gets full-window
  // context (windows are clamped at the edges, never truncated inward).
  const half = windowSeconds / 2;
  const centers: number[] = [];
  if (duration <= windowSeconds) {
    centers.push(duration / 2);
  } else {
    for (let c = half; c <= duration - half + 1e-9; c += hopSeconds) {
      centers.push(c);
    }
    if (duration - half - centers[centers.length - 1] > 0.5) {
      centers.push(duration - half);
    }
  }

  const windows: WindowKey[] = [];
  for (const center of centers) {
    const start = Math.max(0, center - half);
    const end = Math.min(duration, center + half);
    const aggregate = new Float64Array(12);
    let energy = 0;
    for (const frame of frames) {
      if (frame.time < start || frame.time >= end) continue;
      for (let i = 0; i < 12; i++) aggregate[i] += frame.chroma[i] * frame.rms;
      energy += frame.rms;
    }
    if (energy <= 0) continue;
    const key = detectKey(aggregate);
    windows.push({ center, tonic: key.tonic, mode: key.mode });
  }

  if (windows.length === 0) return [];

  // Median-style smoothing: a window differing from both neighbors that
  // agree with each other is an outlier.
  for (let i = 1; i < windows.length - 1; i++) {
    const prev = windows[i - 1];
    const next = windows[i + 1];
    if (
      prev.tonic === next.tonic &&
      prev.mode === next.mode &&
      (windows[i].tonic !== prev.tonic || windows[i].mode !== prev.mode)
    ) {
      windows[i] = { ...windows[i], tonic: prev.tonic, mode: prev.mode };
    }
  }

  // Merge consecutive windows with the same key into spans; a key change
  // is placed at the midpoint between the two disagreeing window centers.
  const spans: KeySpan[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const last = spans[spans.length - 1];
    if (last && last.tonic === w.tonic && last.mode === w.mode) continue;
    const boundary =
      i === 0 ? 0 : (windows[i - 1].center + w.center) / 2;
    spans.push({
      startTime: boundary,
      endTime: duration,
      tonic: w.tonic,
      mode: w.mode,
      name: displayName(w.tonic, w.mode),
    });
  }
  for (let i = 0; i < spans.length - 1; i++) {
    spans[i].endTime = spans[i + 1].startTime;
  }

  // Absorb spans that are too short into the previous span.
  const filtered: KeySpan[] = [];
  for (const span of spans) {
    const length = span.endTime - span.startTime;
    const last = filtered[filtered.length - 1];
    if (length < minSpanSeconds && last) {
      last.endTime = span.endTime;
    } else if (
      last &&
      last.tonic === span.tonic &&
      last.mode === span.mode
    ) {
      last.endTime = span.endTime;
    } else {
      filtered.push({ ...span });
    }
  }
  if (filtered.length > 0) {
    filtered[0].startTime = 0;
    filtered[filtered.length - 1].endTime = duration;
  }

  // Re-merge neighbors that became identical after absorption.
  const merged: KeySpan[] = [];
  for (const span of filtered) {
    const last = merged[merged.length - 1];
    if (last && last.tonic === span.tonic && last.mode === span.mode) {
      last.endTime = span.endTime;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

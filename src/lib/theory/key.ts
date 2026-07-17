/**
 * Musical key detection via Krumhansl-Schmuckler profile correlation.
 *
 * The energy-weighted average chroma of the whole piece is correlated with
 * the 24 rotated major/minor key profiles; the best correlation wins.
 */

import { keyPrefersFlats, pitchClassName } from "./notes";

// Krumhansl & Kessler (1982) probe-tone profiles.
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

export interface KeyEstimate {
  tonic: number; // pitch class 0-11
  mode: "major" | "minor";
  name: string; // e.g. "G major"
  /** Pearson correlation of the winning profile, in [-1, 1]. */
  correlation: number;
  /** Winner correlation minus runner-up correlation; higher = more certain. */
  confidence: number;
  preferFlats: boolean;
  /** All 24 candidates sorted best-first (for display). */
  alternatives: { name: string; correlation: number }[];
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

/**
 * @param aggregateChroma 12-dim summed/averaged chroma over the piece
 */
export function detectKey(aggregateChroma: ArrayLike<number>): KeyEstimate {
  const candidates: {
    tonic: number;
    mode: "major" | "minor";
    correlation: number;
  }[] = [];

  for (let tonic = 0; tonic < 12; tonic++) {
    candidates.push({
      tonic,
      mode: "major",
      correlation: pearson(aggregateChroma, MAJOR_PROFILE, tonic),
    });
    candidates.push({
      tonic,
      mode: "minor",
      correlation: pearson(aggregateChroma, MINOR_PROFILE, tonic),
    });
  }

  candidates.sort((a, b) => b.correlation - a.correlation);
  const best = candidates[0];
  const runnerUp = candidates[1];
  const preferFlats = keyPrefersFlats(best.tonic, best.mode);

  const displayName = (tonic: number, mode: "major" | "minor") =>
    `${pitchClassName(tonic, keyPrefersFlats(tonic, mode))} ${mode}`;

  return {
    tonic: best.tonic,
    mode: best.mode,
    name: displayName(best.tonic, best.mode),
    correlation: best.correlation,
    confidence: best.correlation - runnerUp.correlation,
    preferFlats,
    alternatives: candidates.slice(0, 5).map((c) => ({
      name: displayName(c.tonic, c.mode),
      correlation: c.correlation,
    })),
  };
}

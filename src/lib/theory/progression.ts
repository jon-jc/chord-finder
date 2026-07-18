/**
 * Main-progression detection: find the chord loop a song is built on.
 *
 * The decoded chord sequence (no-chord segments dropped) is scanned for
 * the repeating n-gram (2..8 chords) that covers the most of the sequence,
 * preferring longer patterns and rejecting patterns that are themselves a
 * repetition of a shorter one (C-G-C-G is really C-G).
 */

export interface MainProgression {
  /** Chord ids of one cycle of the loop. */
  chordIds: number[];
  /** How many times the loop occurs (overlap-free). */
  repeats: number;
  /** Fraction of the chord sequence covered by the loop, 0..1. */
  coverage: number;
}

/** True if `pattern` is k copies of a shorter prefix (k >= 2). */
function isPeriodic(pattern: number[]): boolean {
  for (let period = 1; period <= pattern.length / 2; period++) {
    if (pattern.length % period !== 0) continue;
    let matches = true;
    for (let i = period; i < pattern.length; i++) {
      if (pattern[i] !== pattern[i - period]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/** Overlap-free occurrence count of `pattern` in `sequence`. */
function countOccurrences(sequence: number[], pattern: number[]): number {
  let count = 0;
  let i = 0;
  while (i + pattern.length <= sequence.length) {
    let matches = true;
    for (let j = 0; j < pattern.length; j++) {
      if (sequence[i + j] !== pattern[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      count++;
      i += pattern.length;
    } else {
      i++;
    }
  }
  return count;
}

export function findMainProgression(sequence: number[]): MainProgression | null {
  if (sequence.length < 4) return null;

  let best: MainProgression | null = null;
  const seen = new Set<string>();

  for (let n = 2; n <= Math.min(8, Math.floor(sequence.length / 2)); n++) {
    for (let start = 0; start + n <= sequence.length; start++) {
      const pattern = sequence.slice(start, start + n);
      const key = pattern.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      if (isPeriodic(pattern)) continue;

      const repeats = countOccurrences(sequence, pattern);
      if (repeats < 2) continue;

      const coverage = (repeats * n) / sequence.length;
      const score = coverage * Math.sqrt(n);
      const bestScore = best ? best.coverage * Math.sqrt(best.chordIds.length) : 0;
      if (score > bestScore) {
        best = { chordIds: pattern, repeats, coverage };
      }
    }
  }
  return best;
}

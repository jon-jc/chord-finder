/**
 * Chord dictionary and per-frame template scoring.
 *
 * Each chord is a 12-dimensional pitch-class template. Templates include
 * small weights at the harmonics of chord tones (a fifth above the root,
 * etc. arrive naturally via the chroma extractor's harmonic folding, so the
 * templates themselves stay close to the theoretical chord tones with a
 * slightly emphasized root).
 */

import { pitchClassName } from "./notes";

export interface ChordQuality {
  /** Suffix used for display, e.g. "m7". */
  suffix: string;
  /** Chord tones as semitone offsets from the root. */
  intervals: number[];
  /** Prior probability weight; common chords win ties. */
  prior: number;
}

export const CHORD_QUALITIES: ChordQuality[] = [
  { suffix: "", intervals: [0, 4, 7], prior: 1.0 }, // major
  { suffix: "m", intervals: [0, 3, 7], prior: 1.0 }, // minor
  { suffix: "7", intervals: [0, 4, 7, 10], prior: 0.8 },
  { suffix: "maj7", intervals: [0, 4, 7, 11], prior: 0.7 },
  { suffix: "m7", intervals: [0, 3, 7, 10], prior: 0.8 },
  { suffix: "sus2", intervals: [0, 2, 7], prior: 0.5 },
  { suffix: "sus4", intervals: [0, 5, 7], prior: 0.5 },
  { suffix: "dim", intervals: [0, 3, 6], prior: 0.4 },
  { suffix: "m7b5", intervals: [0, 3, 6, 10], prior: 0.4 },
  { suffix: "aug", intervals: [0, 4, 8], prior: 0.3 },
  { suffix: "6", intervals: [0, 4, 7, 9], prior: 0.5 },
  { suffix: "m6", intervals: [0, 3, 7, 9], prior: 0.4 },
];

export interface ChordDef {
  /** Index into the full chord list; NO_CHORD is always last. */
  id: number;
  root: number; // pitch class 0-11, -1 for no-chord
  quality: ChordQuality | null;
  template: Float32Array; // L2-normalized
}

export const NO_CHORD_ID_SUFFIX = "N";

function buildTemplate(root: number, quality: ChordQuality): Float32Array {
  const template = new Float32Array(12);
  for (let i = 0; i < quality.intervals.length; i++) {
    const tone = (root + quality.intervals[i]) % 12;
    // Root slightly emphasized; upper extensions slightly de-emphasized.
    const weight = i === 0 ? 1.1 : i >= 3 ? 0.85 : 1.0;
    template[tone] += weight;
    // Instrument harmonics of each chord tone: the 3rd harmonic lands a
    // fifth above (pc +7), the 5th harmonic a major third above (pc +4).
    template[(tone + 7) % 12] += 0.25 * weight;
    template[(tone + 4) % 12] += 0.08 * weight;
  }
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += template[i] * template[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < 12; i++) template[i] /= norm;
  return template;
}

/**
 * Score assigned to the no-chord state on non-silent frames. Clean chords
 * score well above this against their template; noise scores below it.
 */
export const NO_CHORD_FLOOR = 0.62;

function buildChordList(): ChordDef[] {
  const chords: ChordDef[] = [];
  for (let root = 0; root < 12; root++) {
    for (const quality of CHORD_QUALITIES) {
      chords.push({
        id: chords.length,
        root,
        quality,
        template: buildTemplate(root, quality),
      });
    }
  }
  // No-chord: matched via a fixed score floor, not a template.
  const flat = new Float32Array(12).fill(1 / Math.sqrt(12));
  chords.push({ id: chords.length, root: -1, quality: null, template: flat });
  return chords;
}

export const CHORDS: ChordDef[] = buildChordList();
export const NO_CHORD_ID = CHORDS.length - 1;

export function chordName(chord: ChordDef, preferFlats = false): string {
  if (chord.root < 0 || !chord.quality) return NO_CHORD_ID_SUFFIX;
  return pitchClassName(chord.root, preferFlats) + chord.quality.suffix;
}

export function chordNameById(id: number, preferFlats = false): string {
  return chordName(CHORDS[id], preferFlats);
}

/**
 * Score every chord template against one chroma frame (cosine similarity —
 * both sides are L2-normalized, so this is a plain dot product) scaled by
 * the chord's prior.
 */
export function scoreFrame(chroma: Float32Array, out?: Float32Array): Float32Array {
  const scores = out ?? new Float32Array(CHORDS.length);
  let isSilent = true;
  for (let i = 0; i < 12; i++) {
    if (chroma[i] !== 0) {
      isSilent = false;
      break;
    }
  }
  for (let c = 0; c < CHORDS.length; c++) {
    if (isSilent) {
      scores[c] = c === NO_CHORD_ID ? 1 : 0;
      continue;
    }
    if (c === NO_CHORD_ID) {
      scores[c] = NO_CHORD_FLOOR;
      continue;
    }
    const { template, quality } = CHORDS[c];
    let dot = 0;
    for (let i = 0; i < 12; i++) dot += chroma[i] * template[i];
    const prior = quality ? quality.prior : 0;
    scores[c] = Math.max(0, dot) * (0.9 + 0.1 * prior);
  }
  return scores;
}

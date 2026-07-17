/**
 * Roman-numeral analysis of a chord relative to a detected key.
 */

import { CHORDS } from "./chords";
import type { KeyEstimate } from "./key";

const MAJOR_DEGREES: Record<number, string> = {
  0: "I",
  2: "II",
  4: "III",
  5: "IV",
  7: "V",
  9: "VI",
  11: "VII",
};

const MINOR_DEGREES: Record<number, string> = {
  0: "I",
  2: "II",
  3: "III",
  5: "IV",
  7: "V",
  8: "VI",
  10: "VII",
};

/** Numeral for `chordId` in `key`, e.g. "vi", "V7", "bVII". Empty for N. */
export function romanNumeral(chordId: number, key: KeyEstimate): string {
  const chord = CHORDS[chordId];
  if (!chord || chord.root < 0 || !chord.quality) return "";

  const degrees = key.mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
  const interval = (((chord.root - key.tonic) % 12) + 12) % 12;

  let base = degrees[interval];
  let accidental = "";
  if (!base) {
    // Chromatic root: name it as a flattened upper neighbor.
    const upper = degrees[(interval + 1) % 12];
    if (upper) {
      accidental = "b";
      base = upper;
    } else {
      return "";
    }
  }

  const suffix = chord.quality.suffix;
  const isMinorish = chord.quality.intervals.includes(3);
  const numeral = isMinorish ? base.toLowerCase() : base;

  if (suffix === "dim" || suffix === "m7b5" || suffix === "dim7") {
    return accidental + numeral + "°" + (suffix === "m7b5" ? "7" : "");
  }
  if (suffix === "aug") return accidental + numeral + "+";
  if (suffix === "7") return accidental + numeral + "7";
  if (suffix === "maj7") return accidental + numeral + "maj7";
  if (suffix === "m7") return accidental + numeral + "7";
  if (suffix === "sus2" || suffix === "sus4") return accidental + numeral + suffix;
  if (suffix === "6" || suffix === "m6") return accidental + numeral + "6";
  return accidental + numeral;
}

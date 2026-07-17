/** Consistent chord/pitch-class coloring across all visualizations. */

import { CHORDS, NO_CHORD_ID } from "../theory/chords";

export const NO_CHORD_COLOR = "hsl(220 10% 40%)";

/** Hue wheel by root pitch class; minor-ish qualities render darker. */
export function chordColor(chordId: number, alpha = 1): string {
  if (chordId === NO_CHORD_ID || chordId < 0) {
    return alpha === 1 ? NO_CHORD_COLOR : `hsl(220 10% 40% / ${alpha})`;
  }
  const chord = CHORDS[chordId];
  const hue = chord.root * 30;
  const minorish =
    chord.quality &&
    (chord.quality.intervals.includes(3) || chord.quality.suffix.startsWith("dim"));
  const lightness = minorish ? 46 : 58;
  const saturation = 72;
  return alpha === 1
    ? `hsl(${hue} ${saturation}% ${lightness}%)`
    : `hsl(${hue} ${saturation}% ${lightness}% / ${alpha})`;
}

export function pitchClassColor(pc: number, alpha = 1): string {
  const hue = ((pc % 12) + 12) % 12 * 30;
  return alpha === 1
    ? `hsl(${hue} 70% 55%)`
    : `hsl(${hue} 70% 55% / ${alpha})`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  const rest = Math.floor(s % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * Rhythm tab: columns built from the detected chord progression using the
 * canonical voicing dictionary, placed at strum onsets (or a beat grid
 * when onsets are sparse).
 *
 * This is how published tab videos notate accompaniment in full-band
 * recordings: the guitar part's chord shapes, not a spectral reading of
 * the whole mix.
 */

import type { ChordSegment } from "../analysis/types";
import { CHORDS, NO_CHORD_ID } from "../theory/chords";
import { STANDARD_TUNING, type TabColumn, type TabNote } from "./fretboard";
import { shapesForChord } from "./shapes";

/** Minimum spacing between strum columns within one chord. */
const MIN_STRUM_GAP = 0.22;
/** Without usable onsets, place strums on this many beats. */
const FALLBACK_BEATS_PER_STRUM = 2;

function voicingToNotes(shape: number[], velocity: number): TabNote[] {
  const notes: TabNote[] = [];
  for (let s = 0; s < 6; s++) {
    if (shape[s] < 0) continue;
    notes.push({
      string: s,
      fret: shape[s],
      midi: STANDARD_TUNING[s] + shape[s],
      velocity,
    });
  }
  return notes;
}

/**
 * Build chord-voicing columns for every (real) chord segment.
 *
 * @param onsets detected onset times (strums) in seconds
 * @param tempoBpm beat grid fallback when a segment has no onsets
 */
export function buildRhythmColumns(
  chords: ChordSegment[],
  onsets: number[],
  tempoBpm: number
): TabColumn[] {
  const columns: TabColumn[] = [];
  const beatSeconds = tempoBpm > 0 ? 60 / tempoBpm : 0.6;

  for (const segment of chords) {
    if (segment.chordId === NO_CHORD_ID) continue;
    const chord = CHORDS[segment.chordId];
    if (!chord.quality || chord.root < 0) continue;

    const shape = shapesForChord(segment.chordId)[0];
    if (!shape) continue;
    const velocity = Math.max(0.4, Math.min(1, segment.confidence));

    // Strum times: onsets inside the segment, thinned to a playable rate;
    // always one strum at the chord change itself.
    const inSegment = onsets.filter(
      (t) => t >= segment.startTime && t < segment.endTime - 0.05
    );
    const strums: number[] = [];
    let last = -Infinity;
    for (const t of [segment.startTime, ...inSegment]) {
      if (t - last < MIN_STRUM_GAP) continue;
      strums.push(t);
      last = t;
    }

    // Sparse onsets (sustained pads, wash of a dense mix): fall back to a
    // beat grid so long chords don't render as one lonely strum.
    const segmentBeats =
      (segment.endTime - segment.startTime) / (beatSeconds * FALLBACK_BEATS_PER_STRUM);
    if (strums.length < Math.floor(segmentBeats) && beatSeconds > 0) {
      strums.length = 0;
      for (
        let t = segment.startTime;
        t < segment.endTime - 0.05;
        t += beatSeconds * FALLBACK_BEATS_PER_STRUM
      ) {
        strums.push(t);
      }
    }

    for (let i = 0; i < strums.length; i++) {
      const next = i + 1 < strums.length ? strums[i + 1] : segment.endTime;
      columns.push({
        time: strums[i],
        endTime: next,
        notes: voicingToNotes(shape, velocity),
      });
    }
  }

  return columns.sort((a, b) => a.time - b.time);
}

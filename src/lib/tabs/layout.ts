/**
 * Tab layout: organize fretboard columns into measures using the estimated
 * tempo, and attach the chord name in effect at each measure/column.
 */

import type { ChordSegment } from "../analysis/types";
import type { TabColumn } from "./fretboard";

export interface LaidOutColumn extends TabColumn {
  /** Chord sounding at this column ("" if none/unknown). */
  chordName: string;
  /** Position within its measure, 0..1. */
  measureFraction: number;
}

export interface TabMeasure {
  index: number;
  startTime: number;
  endTime: number;
  columns: LaidOutColumn[];
  /** Chord in effect when the measure starts. */
  chordName: string;
}

export interface TabLayout {
  measures: TabMeasure[];
  tempoBpm: number;
  beatsPerMeasure: number;
}

function chordAt(segments: ChordSegment[], time: number): string {
  const seg = segments.find((s) => time >= s.startTime && time < s.endTime);
  return seg && seg.name !== "N" ? seg.name : "";
}

export function layoutTab(
  columns: TabColumn[],
  chords: ChordSegment[],
  tempoBpm: number,
  duration: number,
  beatsPerMeasure = 4
): TabLayout {
  const bpm = tempoBpm > 0 ? tempoBpm : 100;
  const measureSeconds = (60 / bpm) * beatsPerMeasure;
  const measureCount = Math.max(1, Math.ceil(duration / measureSeconds));

  const measures: TabMeasure[] = [];
  for (let m = 0; m < measureCount; m++) {
    const startTime = m * measureSeconds;
    const endTime = Math.min(duration, (m + 1) * measureSeconds);
    const inMeasure = columns.filter(
      (c) => c.time >= startTime && c.time < endTime
    );
    if (inMeasure.length === 0 && measures.length === 0) continue; // skip leading empties
    measures.push({
      index: m,
      startTime,
      endTime,
      chordName: chordAt(chords, startTime + 0.05),
      columns: inMeasure.map((c) => ({
        ...c,
        chordName: chordAt(chords, c.time),
        measureFraction: (c.time - startTime) / measureSeconds,
      })),
    });
  }

  // Trim trailing empty measures.
  while (measures.length > 0 && measures[measures.length - 1].columns.length === 0) {
    measures.pop();
  }

  return { measures, tempoBpm: bpm, beatsPerMeasure };
}

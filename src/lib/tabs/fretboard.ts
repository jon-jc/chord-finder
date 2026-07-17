/**
 * Mapping note events onto the guitar fretboard.
 *
 * Notes that sound together form a "column". For each column we search all
 * combinations of candidate (string, fret) positions and keep the cheapest
 * playable one: low frets and open strings are cheap, wide stretches and
 * big jumps from the previous hand position are expensive.
 */

import type { NoteEvent } from "../analysis/transcribe";

/** Standard tuning, low to high: E2 A2 D3 G3 B3 E4. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];
export const MAX_FRET = 15;

export interface TabNote {
  /** String index: 0 = low E, 5 = high e. */
  string: number;
  fret: number;
  midi: number;
  velocity: number;
}

export interface TabColumn {
  time: number;
  endTime: number;
  notes: TabNote[];
}

interface Candidate {
  string: number;
  fret: number;
}

function candidatesFor(midi: number): Candidate[] {
  const list: Candidate[] = [];
  for (let s = 0; s < STANDARD_TUNING.length; s++) {
    const fret = midi - STANDARD_TUNING[s];
    if (fret >= 0 && fret <= MAX_FRET) list.push({ string: s, fret });
  }
  return list;
}

/** Fold out-of-range notes into the playable range by octave shifts. */
function intoRange(midi: number): number {
  let m = midi;
  const lowest = STANDARD_TUNING[0];
  const highest = STANDARD_TUNING[5] + MAX_FRET;
  while (m < lowest) m += 12;
  while (m > highest) m -= 12;
  return m;
}

function columnCost(assignment: Candidate[], previousCenter: number | null): number {
  let cost = 0;
  const frettedFrets: number[] = [];
  for (const { fret } of assignment) {
    if (fret === 0) continue; // open strings are free
    frettedFrets.push(fret);
    cost += fret * 0.6; // prefer low positions
    if (fret > 12) cost += (fret - 12) * 1.5;
  }
  if (frettedFrets.length > 0) {
    const min = Math.min(...frettedFrets);
    const max = Math.max(...frettedFrets);
    const span = max - min;
    cost += span * 3;
    if (span > 4) cost += (span - 4) * 25; // nearly unplayable stretch
    if (previousCenter !== null) {
      cost += Math.abs((min + max) / 2 - previousCenter) * 1.2;
    }
  }
  return cost;
}

/**
 * Group simultaneous notes and assign string/fret positions.
 */
export function mapToFretboard(notes: NoteEvent[]): TabColumn[] {
  if (notes.length === 0) return [];

  // Group notes that start (nearly) together. Chain grouping — a note joins
  // the group if it starts within 50ms of the group's most recent note — so
  // strummed chords (staggered onsets) collapse into one column.
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const groups: NoteEvent[][] = [];
  for (const note of sorted) {
    const last = groups[groups.length - 1];
    if (last && note.startTime - last[last.length - 1].startTime < 0.05) {
      last.push(note);
    } else {
      groups.push([note]);
    }
  }

  const columns: TabColumn[] = [];
  let previousCenter: number | null = null;

  for (const group of groups) {
    // Deduplicate pitches and cap at 6 strings, keeping the strongest.
    const byMidi = new Map<number, NoteEvent>();
    for (const note of group) {
      const midi = intoRange(note.midi);
      const existing = byMidi.get(midi);
      if (!existing || note.velocity > existing.velocity) {
        byMidi.set(midi, { ...note, midi });
      }
    }
    const unique = Array.from(byMidi.values())
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 6)
      .sort((a, b) => a.midi - b.midi);

    const candidateSets = unique.map((n) => candidatesFor(n.midi));
    if (candidateSets.some((set) => set.length === 0)) continue;

    // Depth-first search over assignments with used-string masking.
    let best: Candidate[] | null = null;
    let bestCost = Infinity;
    const chosen: Candidate[] = [];

    const search = (index: number, usedStrings: number) => {
      if (index === unique.length) {
        const cost = columnCost(chosen, previousCenter);
        if (cost < bestCost) {
          bestCost = cost;
          best = [...chosen];
        }
        return;
      }
      for (const candidate of candidateSets[index]) {
        const bit = 1 << candidate.string;
        if (usedStrings & bit) continue;
        chosen.push(candidate);
        search(index + 1, usedStrings | bit);
        chosen.pop();
      }
    };
    search(0, 0);

    if (!best) continue;
    const assignment = best as Candidate[];

    const frets = assignment
      .filter((c) => c.fret > 0)
      .map((c) => c.fret);
    if (frets.length > 0) {
      previousCenter = (Math.min(...frets) + Math.max(...frets)) / 2;
    }

    columns.push({
      time: group[0].startTime,
      endTime: Math.max(...group.map((n) => n.endTime)),
      notes: unique
        .map((note, i) => ({
          string: assignment[i].string,
          fret: assignment[i].fret,
          midi: note.midi,
          velocity: note.velocity,
        }))
        .sort((a, b) => a.string - b.string),
    });
  }

  return columns;
}

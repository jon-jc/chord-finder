/**
 * Mapping note events onto the guitar fretboard.
 *
 * Notes that sound together form a "column". For each column we enumerate
 * candidate (string, fret) assignments and keep the K cheapest by intrinsic
 * cost — low frets and open strings are cheap, wide stretches expensive,
 * and assignments that line up with a known voicing of the chord in effect
 * (open C, barre F, ...) get a discount. A Viterbi pass over the whole
 * piece then picks one assignment per column so the hand moves smoothly
 * instead of jumping around the neck.
 */

import type { NoteEvent } from "../analysis/transcribe";
import { shapesForChord } from "./shapes";

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

/** Minimal chord-segment view used for shape guidance. */
export interface ChordContext {
  chordId: number;
  startTime: number;
  endTime: number;
}

interface Candidate {
  string: number;
  fret: number;
}

interface ScoredAssignment {
  candidates: Candidate[];
  cost: number;
  /** Mean fretted fret (hand position); null if everything is open. */
  center: number | null;
}

const K_BEST = 8;
const MOVE_WEIGHT = 1.3;

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

/** Intrinsic (position-independent) cost of one assignment. */
function intrinsicCost(assignment: Candidate[], shapes: number[][]): number {
  let cost = 0;
  const frettedFrets: number[] = [];
  for (const { fret } of assignment) {
    if (fret === 0) continue; // open strings are free
    frettedFrets.push(fret);
    cost += fret * 0.45; // prefer low positions
    if (fret > 12) cost += (fret - 12) * 1.5;
  }
  if (frettedFrets.length > 0) {
    const span = Math.max(...frettedFrets) - Math.min(...frettedFrets);
    cost += span * 2.5;
    if (span > 4) cost += (span - 4) * 25; // nearly unplayable stretch
  }

  // Shape guidance: notes that sit exactly where a known voicing of the
  // active chord puts them make the whole assignment cheaper.
  let bestShapeBonus = 0;
  for (const shape of shapes) {
    let matched = 0;
    for (const { string, fret } of assignment) {
      if (shape[string] === fret) matched++;
    }
    let bonus = matched * 1.8;
    if (matched === assignment.length && matched >= 2) bonus += 2; // full voicing
    if (bonus > bestShapeBonus) bestShapeBonus = bonus;
  }
  return cost - bestShapeBonus;
}

function centerOf(assignment: Candidate[]): number | null {
  let sum = 0;
  let count = 0;
  for (const { fret } of assignment) {
    if (fret > 0) {
      sum += fret;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/** K cheapest string/fret assignments for one column of notes. */
function bestAssignments(
  candidateSets: Candidate[][],
  shapes: number[][]
): ScoredAssignment[] {
  const results: ScoredAssignment[] = [];
  const chosen: Candidate[] = [];

  const search = (index: number, usedStrings: number) => {
    if (index === candidateSets.length) {
      const candidates = [...chosen];
      results.push({
        candidates,
        cost: intrinsicCost(candidates, shapes),
        center: centerOf(candidates),
      });
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

  results.sort((a, b) => a.cost - b.cost);
  return results.slice(0, K_BEST);
}

/**
 * Group simultaneous notes and assign string/fret positions, using the
 * chords in effect (optional) as voicing guidance.
 */
export function mapToFretboard(
  notes: NoteEvent[],
  chords: ChordContext[] = []
): TabColumn[] {
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

  // Per-column candidate assignments.
  interface ColumnPlan {
    group: NoteEvent[];
    unique: NoteEvent[];
    options: ScoredAssignment[];
  }
  const plans: ColumnPlan[] = [];

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

    const time = group[0].startTime;
    const chord = chords.find((c) => time >= c.startTime && time < c.endTime);
    const shapes = chord ? shapesForChord(chord.chordId) : [];

    const options = bestAssignments(candidateSets, shapes);
    if (options.length > 0) plans.push({ group, unique, options });
  }

  if (plans.length === 0) return [];

  // Viterbi over columns: total cost = intrinsic + hand-movement between
  // consecutive columns. Open-only columns inherit the running hand
  // position, so they neither cost movement nor reset it.
  const stateCosts: number[][] = [];
  const statePrev: number[][] = [];
  const stateCenter: (number | null)[][] = [];

  for (let i = 0; i < plans.length; i++) {
    const { options } = plans[i];
    const costs: number[] = [];
    const prevs: number[] = [];
    const centers: (number | null)[] = [];

    for (let k = 0; k < options.length; k++) {
      const optionCenter = options[k].center;
      if (i === 0) {
        costs.push(options[k].cost);
        prevs.push(-1);
        centers.push(optionCenter);
        continue;
      }
      let bestTotal = Infinity;
      let bestPrev = 0;
      for (let j = 0; j < stateCosts[i - 1].length; j++) {
        const prevCenter = stateCenter[i - 1][j];
        const movement =
          optionCenter !== null && prevCenter !== null
            ? Math.abs(optionCenter - prevCenter) * MOVE_WEIGHT
            : 0;
        const total = stateCosts[i - 1][j] + options[k].cost + movement;
        if (total < bestTotal) {
          bestTotal = total;
          bestPrev = j;
        }
      }
      costs.push(bestTotal);
      prevs.push(bestPrev);
      // Effective hand position: this column's, or inherited if all-open.
      centers.push(optionCenter !== null ? optionCenter : stateCenter[i - 1][bestPrev]);
    }
    stateCosts.push(costs);
    statePrev.push(prevs);
    stateCenter.push(centers);
  }

  // Backtrack the cheapest path.
  const chosenIndex = new Array<number>(plans.length);
  const lastCosts = stateCosts[plans.length - 1];
  let cursor = lastCosts.indexOf(Math.min(...lastCosts));
  for (let i = plans.length - 1; i >= 0; i--) {
    chosenIndex[i] = cursor;
    cursor = statePrev[i][cursor];
  }

  return plans.map((plan, i) => {
    const assignment = plan.options[chosenIndex[i]].candidates;
    return {
      time: plan.group[0].startTime,
      endTime: Math.max(...plan.group.map((n) => n.endTime)),
      notes: plan.unique
        .map((note, idx) => ({
          string: assignment[idx].string,
          fret: assignment[idx].fret,
          midi: note.midi,
          velocity: note.velocity,
        }))
        .sort((a, b) => a.string - b.string),
    };
  });
}

/**
 * Canonical guitar chord voicings (standard tuning).
 *
 * Used to bias fret assignment toward fingerings guitarists actually play:
 * the well-known open shapes, plus movable E-form and A-form barre shapes
 * for every root. Frets are listed low-E to high-e; -1 = string not played.
 */

import { CHORDS } from "../theory/chords";
import { PITCH_CLASSES } from "../theory/notes";

const OPEN_SHAPES: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0],
  A: [-1, 0, 2, 2, 2, 0],
  G: [3, 2, 0, 0, 0, 3],
  E: [0, 2, 2, 1, 0, 0],
  D: [-1, -1, 0, 2, 3, 2],
  F: [1, 3, 3, 2, 1, 1],
  Am: [-1, 0, 2, 2, 1, 0],
  Em: [0, 2, 2, 0, 0, 0],
  Dm: [-1, -1, 0, 2, 3, 1],
  A7: [-1, 0, 2, 0, 2, 0],
  B7: [-1, 2, 1, 2, 0, 2],
  C7: [-1, 3, 2, 3, 1, 0],
  D7: [-1, -1, 0, 2, 1, 2],
  E7: [0, 2, 0, 1, 0, 0],
  G7: [3, 2, 0, 0, 0, 1],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  Fmaj7: [-1, -1, 3, 2, 1, 0],
  Amaj7: [-1, 0, 2, 1, 2, 0],
  Dmaj7: [-1, -1, 0, 2, 2, 2],
  Am7: [-1, 0, 2, 0, 1, 0],
  Em7: [0, 2, 2, 0, 3, 0],
  Dm7: [-1, -1, 0, 2, 1, 1],
  Asus2: [-1, 0, 2, 2, 0, 0],
  Dsus2: [-1, -1, 0, 2, 3, 0],
  Esus4: [0, 2, 2, 2, 0, 0],
  Asus4: [-1, 0, 2, 2, 3, 0],
  Dsus4: [-1, -1, 0, 2, 3, 3],
  C5: [-1, 3, 5, 5, -1, -1],
  A5: [-1, 0, 2, 2, -1, -1],
  G5: [3, 5, 5, -1, -1, -1],
  E5: [0, 2, 2, -1, -1, -1],
  D5: [-1, -1, 0, 2, 3, -1],
  Cadd9: [-1, 3, 2, 0, 3, 0],
  Gadd9: [3, 2, 0, 2, 0, 3],
  Eadd9: [0, 2, 4, 1, 0, 0],
};

/** Movable shapes rooted on the low E string (E-form barre). */
const E_FORMS: Record<string, number[]> = {
  "": [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  "7": [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  "5": [0, 2, 2, -1, -1, -1],
  sus4: [0, 2, 2, 2, 0, 0],
};

/** Movable shapes rooted on the A string (A-form barre). */
const A_FORMS: Record<string, number[]> = {
  "": [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  "7": [-1, 0, 2, 0, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
  "5": [-1, 0, 2, 2, -1, -1],
  sus4: [-1, 0, 2, 2, 3, 0],
};

function shifted(base: number[], barre: number): number[] {
  return base.map((f) => (f < 0 ? -1 : f + barre));
}

const shapeCache = new Map<number, number[][]>();

/**
 * Plausible voicings for a chord id: its open shape (if one exists) and the
 * E-form/A-form barre shapes at the right fret. Empty for no-chord.
 */
export function shapesForChord(chordId: number): number[][] {
  const cached = shapeCache.get(chordId);
  if (cached) return cached;

  const chord = CHORDS[chordId];
  const shapes: number[][] = [];
  if (chord && chord.root >= 0 && chord.quality) {
    const suffix = chord.quality.suffix;
    const open = OPEN_SHAPES[PITCH_CLASSES[chord.root] + suffix];
    if (open) shapes.push(open);

    const eForm = E_FORMS[suffix];
    if (eForm) {
      const barre = (chord.root - 4 + 12) % 12; // low E string is pc 4
      if (barre > 0 && barre <= 10) shapes.push(shifted(eForm, barre));
    }
    const aForm = A_FORMS[suffix];
    if (aForm) {
      const barre = (chord.root - 9 + 12) % 12; // A string is pc 9
      if (barre > 0 && barre <= 10) shapes.push(shifted(aForm, barre));
    }
  }
  shapeCache.set(chordId, shapes);
  return shapes;
}

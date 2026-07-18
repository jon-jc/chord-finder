import { describe, expect, it } from "vitest";
import { estimatePitches } from "../analysis/pitches";
import { mapToFretboard, MAX_FRET, STANDARD_TUNING } from "../tabs/fretboard";
import { shapesForChord } from "../tabs/shapes";
import { CHORDS } from "../theory/chords";
import { renderNotes, TEST_SAMPLE_RATE } from "./synth";

function chordIdOf(root: number, suffix: string): number {
  const chord = CHORDS.find((c) => c.root === root && c.quality?.suffix === suffix);
  if (!chord) throw new Error(`no chord ${root}${suffix}`);
  return chord.id;
}

function note(midi: number, startTime: number, velocity = 1) {
  return { midi, startTime, endTime: startTime + 1, velocity };
}

describe("shapesForChord", () => {
  it("every shape actually voices the chord's pitch classes", () => {
    for (const chord of CHORDS) {
      if (!chord.quality || chord.root < 0) continue;
      const chordPcs = new Set(
        chord.quality.intervals.map((iv) => (chord.root + iv) % 12)
      );
      for (const shape of shapesForChord(chord.id)) {
        for (let s = 0; s < 6; s++) {
          if (shape[s] < 0) continue;
          const pc = (STANDARD_TUNING[s] + shape[s]) % 12;
          expect(chordPcs.has(pc)).toBe(true);
        }
      }
    }
  });
});

describe("mapToFretboard with chord context", () => {
  it("renders an open C strum as the standard x32010 shape", () => {
    const columns = mapToFretboard(
      [note(48, 0), note(52, 0.01), note(55, 0.02), note(60, 0.03), note(64, 0.04)],
      [{ chordId: chordIdOf(0, ""), startTime: 0, endTime: 2 }]
    );
    expect(columns.length).toBe(1);
    const byString = new Map(columns[0].notes.map((n) => [n.string, n.fret]));
    expect(byString.get(1)).toBe(3); // A string, 3rd fret = C3
    expect(byString.get(2)).toBe(2); // D string, 2nd fret = E3
    expect(byString.get(3)).toBe(0); // open G
    expect(byString.get(4)).toBe(1); // B string, 1st fret = C4
    expect(byString.get(5)).toBe(0); // open e = E4
  });

  it("renders an open G strum as the standard 320003 shape", () => {
    const columns = mapToFretboard(
      [
        note(43, 0), // G2
        note(47, 0.01), // B2
        note(50, 0.02), // D3
        note(55, 0.03), // G3
        note(59, 0.04), // B3
        note(67, 0.045), // G4
      ],
      [{ chordId: chordIdOf(7, ""), startTime: 0, endTime: 2 }]
    );
    expect(columns.length).toBe(1);
    const byString = new Map(columns[0].notes.map((n) => [n.string, n.fret]));
    expect(byString.get(0)).toBe(3); // low E, 3rd fret = G2
    expect(byString.get(1)).toBe(2); // A string, 2nd fret = B2
    expect(byString.get(2)).toBe(0); // open D
    expect(byString.get(3)).toBe(0); // open G
    expect(byString.get(4)).toBe(0); // open B
    expect(byString.get(5)).toBe(3); // high e, 3rd fret = G4
  });

  it("keeps a repeated chord in the same position across columns", () => {
    const chords = [{ chordId: chordIdOf(0, ""), startTime: 0, endTime: 10 }];
    const strum = (t: number) => [note(48, t), note(52, t + 0.01), note(55, t + 0.02)];
    const columns = mapToFretboard(
      [...strum(0), ...strum(1), ...strum(2)],
      chords
    );
    expect(columns.length).toBe(3);
    const signature = (i: number) =>
      columns[i].notes.map((n) => `${n.string}:${n.fret}`).join(",");
    expect(signature(1)).toBe(signature(0));
    expect(signature(2)).toBe(signature(0));
  });

  it("still maps correctly without chord context (invariants hold)", () => {
    const columns = mapToFretboard([
      note(48, 0),
      note(52, 0.01),
      note(55, 0.02),
      note(60, 0.03),
    ]);
    expect(columns.length).toBe(1);
    for (const n of columns[0].notes) {
      expect(n.fret).toBeGreaterThanOrEqual(0);
      expect(n.fret).toBeLessThanOrEqual(MAX_FRET);
      expect(STANDARD_TUNING[n.string] + n.fret).toBe(n.midi);
    }
    const strings = columns[0].notes.map((n) => n.string);
    expect(new Set(strings).size).toBe(strings.length);
  });

  it("avoids jumping around the neck for a melody in high position", () => {
    // A5 B5 C6 melody: playable around fret 5-8 on the high strings; the
    // hand should stay in one region rather than alternating positions.
    const columns = mapToFretboard([
      note(81, 0),
      note(83, 0.5),
      note(84, 1),
      note(81, 1.5),
      note(83, 2),
      note(84, 2.5),
    ]);
    expect(columns.length).toBe(6);
    const centers = columns.map((c) => c.notes[0].fret);
    const span = Math.max(...centers) - Math.min(...centers);
    expect(span).toBeLessThanOrEqual(4);
  });
});

describe("chord-prior pitch estimation", () => {
  it("keeps chord tones with a matching prior", () => {
    const audio = renderNotes([48, 52, 55], 1); // C E G
    const pitches = estimatePitches(audio, TEST_SAMPLE_RATE, {
      preferredPcs: [0, 4, 7],
    });
    const midis = pitches.map((p) => p.midi);
    expect(midis).toContain(48);
    expect(midis).toContain(52);
    expect(midis).toContain(55);
  });

  it("does not hallucinate prior tones that are not sounding", () => {
    const audio = renderNotes([48], 1); // just C3
    const pitches = estimatePitches(audio, TEST_SAMPLE_RATE, {
      preferredPcs: [0, 4, 7],
    });
    const pcs = new Set(pitches.map((p) => p.midi % 12));
    expect(pcs.has(4)).toBe(false);
    expect(pcs.has(7)).toBe(false);
  });
});

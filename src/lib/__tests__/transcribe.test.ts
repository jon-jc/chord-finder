import { describe, expect, it } from "vitest";
import { detectOnsets } from "../analysis/onsets";
import { estimatePitches } from "../analysis/pitches";
import { transcribeNotes } from "../analysis/transcribe";
import { mapToFretboard, STANDARD_TUNING, MAX_FRET } from "../tabs/fretboard";
import { layoutTab } from "../tabs/layout";
import { renderAsciiTab } from "../tabs/ascii";
import { concat, renderNotes, TEST_SAMPLE_RATE } from "./synth";

describe("detectOnsets", () => {
  it("finds one onset per plucked note", () => {
    const audio = concat([
      renderNotes([60], 0.5),
      renderNotes([64], 0.5),
      renderNotes([67], 0.5),
      renderNotes([72], 0.5),
    ]);
    const { onsets } = detectOnsets(audio, TEST_SAMPLE_RATE);
    expect(onsets.length).toBe(4);
    const expected = [0, 0.5, 1.0, 1.5];
    onsets.forEach((t, i) => {
      expect(Math.abs(t - expected[i])).toBeLessThan(0.08);
    });
  });
});

describe("estimatePitches", () => {
  it("recovers the notes of a chord", () => {
    const audio = renderNotes([48, 52, 55], 1); // C3 E3 G3
    const pitches = estimatePitches(audio, TEST_SAMPLE_RATE);
    const midis = pitches.map((p) => p.midi);
    expect(midis).toContain(48);
    expect(midis).toContain(52);
    expect(midis).toContain(55);
    expect(midis.length).toBeLessThanOrEqual(4);
  });

  it("recovers a single melody note", () => {
    const audio = renderNotes([69], 0.6); // A4
    const pitches = estimatePitches(audio, TEST_SAMPLE_RATE);
    expect(pitches.map((p) => p.midi)).toContain(69);
  });
});

describe("transcribeNotes", () => {
  it("produces note events aligned with onsets", () => {
    const audio = concat([
      renderNotes([52], 0.6), // E3
      renderNotes([55], 0.6), // G3
      renderNotes([59], 0.6), // B3
    ]);
    const { notes } = transcribeNotes(audio, TEST_SAMPLE_RATE);
    const midis = new Set(notes.map((n) => n.midi));
    expect(midis.has(52)).toBe(true);
    expect(midis.has(55)).toBe(true);
    expect(midis.has(59)).toBe(true);
    for (const note of notes) {
      expect(note.endTime).toBeGreaterThan(note.startTime);
    }
  });
});

describe("mapToFretboard", () => {
  it("assigns playable positions (unique strings, small span)", () => {
    const columns = mapToFretboard([
      { midi: 48, startTime: 0, endTime: 1, velocity: 1 }, // C3
      { midi: 52, startTime: 0, endTime: 1, velocity: 1 }, // E3
      { midi: 55, startTime: 0, endTime: 1, velocity: 1 }, // G3
      { midi: 60, startTime: 0, endTime: 1, velocity: 1 }, // C4
    ]);
    expect(columns.length).toBe(1);
    const notes = columns[0].notes;
    expect(notes.length).toBe(4);

    const strings = notes.map((n) => n.string);
    expect(new Set(strings).size).toBe(strings.length);

    for (const note of notes) {
      expect(note.fret).toBeGreaterThanOrEqual(0);
      expect(note.fret).toBeLessThanOrEqual(MAX_FRET);
      expect(STANDARD_TUNING[note.string] + note.fret).toBe(note.midi);
    }

    const fretted = notes.filter((n) => n.fret > 0).map((n) => n.fret);
    if (fretted.length > 1) {
      expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4);
    }
  });

  it("octave-folds notes outside the guitar range", () => {
    const columns = mapToFretboard([
      { midi: 28, startTime: 0, endTime: 1, velocity: 1 }, // E1, below range
    ]);
    expect(columns.length).toBe(1);
    expect(columns[0].notes[0].midi).toBe(40); // folded to E2
  });

  it("keeps melody transitions close on the neck", () => {
    const columns = mapToFretboard([
      { midi: 64, startTime: 0, endTime: 0.5, velocity: 1 },
      { midi: 65, startTime: 0.5, endTime: 1, velocity: 1 },
      { midi: 67, startTime: 1, endTime: 1.5, velocity: 1 },
    ]);
    expect(columns.length).toBe(3);
    for (const col of columns) {
      expect(col.notes[0].fret).toBeLessThanOrEqual(5);
    }
  });
});

describe("renderAsciiTab", () => {
  it("renders six labeled strings with fret numbers and chords", () => {
    const columns = mapToFretboard([
      { midi: 48, startTime: 0.1, endTime: 1, velocity: 1 },
      { midi: 52, startTime: 0.1, endTime: 1, velocity: 1 },
      { midi: 55, startTime: 0.1, endTime: 1, velocity: 1 },
    ]);
    const layout = layoutTab(
      columns,
      [
        {
          chordId: 0,
          name: "C",
          startTime: 0,
          endTime: 2,
          confidence: 0.9,
        },
      ],
      120,
      2
    );
    const text = renderAsciiTab(layout, "Test");
    expect(text).toContain("e|");
    expect(text).toContain("E|");
    expect(text).toContain("C");
    expect(text).toMatch(/\d/);
    expect(text).toContain("BPM");
  });
});

import { describe, expect, it } from "vitest";
import { analyzeAudio } from "../analysis/analyze";
import {
  addNoise,
  chordMidiNotes,
  concat,
  renderNotes,
  TEST_SAMPLE_RATE,
} from "./synth";

const MAJOR = [0, 4, 7];
const MINOR = [0, 3, 7];

function detectedNames(result: ReturnType<typeof analyzeAudio>): string[] {
  return result.chords
    .filter((s) => s.name !== "N" && s.endTime - s.startTime > 0.5)
    .map((s) => s.name);
}

describe("advanced chord detection", () => {
  it("recognizes power chords (no third)", () => {
    const audio = concat([
      renderNotes([48, 55, 60], 2.5), // C3 G3 C4 -> C5
      renderNotes([50, 57, 62], 2.5), // D3 A3 D4 -> D5
    ]);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    expect(detectedNames(result)).toEqual(["C5", "D5"]);
  });

  it("recognizes add9 chords", () => {
    const audio = renderNotes([48, 52, 55, 62], 3); // C E G D
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    expect(detectedNames(result)).toEqual(["Cadd9"]);
  });

  it("labels inversions as slash chords from the bass register", () => {
    // First-inversion C major: E2 in the bass under a C major triad.
    const audio = renderNotes([40, 60, 64, 67], 3); // E2, C4, E4, G4
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    const names = detectedNames(result);
    expect(names).toEqual(["C/E"]);
    expect(result.chords.find((s) => s.name === "C/E")?.bassPc).toBe(4);
  });

  it("keeps root-position chords unlabeled", () => {
    const audio = renderNotes([36, 48, 52, 55], 3); // C2 root under C major
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    expect(detectedNames(result)).toEqual(["C"]);
  });

  it("survives noisy recordings", () => {
    const progression = [
      { root: 0, intervals: MAJOR },
      { root: 5, intervals: MAJOR },
      { root: 7, intervals: MAJOR },
      { root: 0, intervals: MAJOR },
    ];
    const clean = concat(
      progression.map((c) => renderNotes(chordMidiNotes(c.root, c.intervals), 2))
    );
    const noisy = addNoise(clean, 0.02);
    const result = analyzeAudio(noisy, TEST_SAMPLE_RATE);
    expect(detectedNames(result)).toEqual(["C", "F", "G", "C"]);
    expect(result.key.name).toBe("C major");
  });

  it("the diatonic second pass keeps in-key progressions clean", () => {
    const progression = [
      { root: 7, intervals: MAJOR }, // G
      { root: 4, intervals: MINOR }, // Em
      { root: 0, intervals: MAJOR }, // C
      { root: 2, intervals: MAJOR }, // D
    ];
    const audio = concat(
      progression.map((c) => renderNotes(chordMidiNotes(c.root, c.intervals), 2))
    );
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    expect(detectedNames(result)).toEqual(["G", "Em", "C", "D"]);
    expect(result.key.name).toBe("G major");
  });
});

describe("key modulation tracking", () => {
  it("reports a single span for non-modulating audio", () => {
    const audio = concat([
      renderNotes(chordMidiNotes(0, MAJOR), 4),
      renderNotes(chordMidiNotes(5, MAJOR), 4),
      renderNotes(chordMidiNotes(7, MAJOR), 4),
      renderNotes(chordMidiNotes(0, MAJOR), 4),
    ]);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    expect(result.keyTimeline.length).toBe(1);
    expect(result.keyTimeline[0].name).toBe("C major");
  });

  it("detects a modulation between distant keys", () => {
    // 12s solidly in C major, then 12s solidly in F# major.
    const inC = concat([
      renderNotes(chordMidiNotes(0, MAJOR), 3),
      renderNotes(chordMidiNotes(5, MAJOR), 3),
      renderNotes(chordMidiNotes(7, MAJOR), 3),
      renderNotes(chordMidiNotes(0, MAJOR), 3),
    ]);
    const inFsharp = concat([
      renderNotes(chordMidiNotes(6, MAJOR), 3),
      renderNotes(chordMidiNotes(11, MAJOR), 3),
      renderNotes(chordMidiNotes(1, MAJOR), 3),
      renderNotes(chordMidiNotes(6, MAJOR), 3),
    ]);
    const result = analyzeAudio(concat([inC, inFsharp]), TEST_SAMPLE_RATE);

    expect(result.keyTimeline.length).toBeGreaterThanOrEqual(2);
    expect(result.keyTimeline[0].name).toBe("C major");
    const last = result.keyTimeline[result.keyTimeline.length - 1];
    expect(last.name).toBe("F# major");
    // The switch should happen somewhere near the actual boundary (12s).
    expect(Math.abs(last.startTime - 12)).toBeLessThan(7);
  });
});

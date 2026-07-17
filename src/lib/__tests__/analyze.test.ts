import { describe, expect, it } from "vitest";
import { analyzeAudio } from "../analysis/analyze";
import { chordMidiNotes, concat, renderNotes, TEST_SAMPLE_RATE } from "./synth";

const MAJOR = [0, 4, 7];
const MINOR = [0, 3, 7];

describe("analyzeAudio", () => {
  it("recognizes a I-IV-V-I progression in C and detects the key", () => {
    const progression = [
      { root: 0, intervals: MAJOR, name: "C" },
      { root: 5, intervals: MAJOR, name: "F" },
      { root: 7, intervals: MAJOR, name: "G" },
      { root: 0, intervals: MAJOR, name: "C" },
    ];
    const audio = concat(
      progression.map((c) => renderNotes(chordMidiNotes(c.root, c.intervals), 2))
    );

    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);

    const detected = result.chords
      .filter((s) => s.name !== "N" && s.endTime - s.startTime > 0.5)
      .map((s) => s.name);
    expect(detected).toEqual(["C", "F", "G", "C"]);
    expect(result.key.name).toBe("C major");
  });

  it("recognizes minor chords and a minor key", () => {
    const progression = [
      { root: 9, intervals: MINOR }, // Am
      { root: 2, intervals: MINOR }, // Dm
      { root: 4, intervals: MAJOR }, // E
      { root: 9, intervals: MINOR }, // Am
    ];
    const audio = concat(
      progression.map((c) => renderNotes(chordMidiNotes(c.root, c.intervals), 2))
    );

    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    const detected = result.chords
      .filter((s) => s.name !== "N" && s.endTime - s.startTime > 0.5)
      .map((s) => s.name);
    expect(detected).toEqual(["Am", "Dm", "E", "Am"]);
    expect(result.key.name).toBe("A minor");
  });

  it("recognizes seventh chords", () => {
    const audio = concat([
      renderNotes(chordMidiNotes(7, [0, 4, 7, 10]), 2.5), // G7
      renderNotes(chordMidiNotes(0, [0, 4, 7, 11]), 2.5), // Cmaj7
    ]);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    const detected = result.chords
      .filter((s) => s.name !== "N" && s.endTime - s.startTime > 0.5)
      .map((s) => s.name);
    expect(detected).toEqual(["G7", "Cmaj7"]);
  });

  it("tolerates detuned recordings via tuning estimation", () => {
    const audio = concat([
      renderNotes(chordMidiNotes(0, MAJOR), 2, TEST_SAMPLE_RATE, 30),
      renderNotes(chordMidiNotes(7, MAJOR), 2, TEST_SAMPLE_RATE, 30),
    ]);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    expect(Math.abs(result.tuningCents - 30)).toBeLessThan(12);
    const detected = result.chords
      .filter((s) => s.name !== "N" && s.endTime - s.startTime > 0.5)
      .map((s) => s.name);
    expect(detected).toEqual(["C", "G"]);
  });

  it("labels silence as no-chord", () => {
    const audio = concat([
      new Float32Array(TEST_SAMPLE_RATE), // 1s silence
      renderNotes(chordMidiNotes(2, MAJOR), 2), // D
    ]);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    expect(result.chords[0].name).toBe("N");
    expect(result.chords.some((s) => s.name === "D")).toBe(true);
  });

  it("spells chords with flats in flat keys", () => {
    const progression = [
      { root: 10, intervals: MAJOR }, // Bb
      { root: 3, intervals: MAJOR }, // Eb
      { root: 5, intervals: MAJOR }, // F
      { root: 10, intervals: MAJOR }, // Bb
    ];
    const audio = concat(
      progression.map((c) => renderNotes(chordMidiNotes(c.root, c.intervals), 2))
    );
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    expect(result.key.name).toBe("Bb major");
    const detected = result.chords
      .filter((s) => s.name !== "N" && s.endTime - s.startTime > 0.5)
      .map((s) => s.name);
    expect(detected).toEqual(["Bb", "Eb", "F", "Bb"]);
  });
});

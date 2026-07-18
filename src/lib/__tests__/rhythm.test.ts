import { describe, expect, it } from "vitest";
import { analyzeAudio } from "../analysis/analyze";
import { classifyArrangement } from "../analysis/arrangement";
import { buildRhythmColumns } from "../tabs/rhythm";
import { STANDARD_TUNING } from "../tabs/fretboard";
import { CHORDS } from "../theory/chords";
import {
  addNoise,
  chordMidiNotes,
  concat,
  noiseSource,
  renderNotes,
  TEST_SAMPLE_RATE,
} from "./synth";

const MAJOR = [0, 4, 7];
const MINOR = [0, 3, 7];

function chordIdOf(root: number, suffix: string): number {
  const chord = CHORDS.find((c) => c.root === root && c.quality?.suffix === suffix);
  if (!chord) throw new Error(`no chord ${root}${suffix}`);
  return chord.id;
}

/** Band-style mix: chords + drum-like noise bursts + hiss. */
function denseMix(): Float32Array {
  const clean = concat([
    renderNotes(chordMidiNotes(4, MAJOR), 2), // E
    renderNotes(chordMidiNotes(9, MINOR), 2), // Am
    renderNotes(chordMidiNotes(2, MAJOR), 2), // D
    renderNotes(chordMidiNotes(4, MAJOR), 2), // E
  ]);
  const mix = addNoise(clean, 0.012, 7);
  const burst = noiseSource(11);
  const burstLen = Math.floor(0.06 * TEST_SAMPLE_RATE);
  for (let t = 0; t < mix.length; t += Math.floor(0.5 * TEST_SAMPLE_RATE)) {
    for (let i = 0; i < burstLen && t + i < mix.length; i++) {
      const env = Math.exp((-30 * i) / TEST_SAMPLE_RATE);
      mix[t + i] += burst() * 0.25 * env;
    }
  }
  return mix;
}

describe("classifyArrangement", () => {
  it("labels clean chord recordings as solo", () => {
    const clean = concat([
      renderNotes(chordMidiNotes(0, MAJOR), 2),
      renderNotes(chordMidiNotes(7, MAJOR), 2),
    ]);
    expect(classifyArrangement(clean, TEST_SAMPLE_RATE).mode).toBe("solo");
  });

  it("tolerates recording hiss without flipping to dense", () => {
    const clean = concat([
      renderNotes(chordMidiNotes(0, MAJOR), 2),
      renderNotes(chordMidiNotes(7, MAJOR), 2),
    ]);
    const hissy = addNoise(clean, 0.004, 3);
    expect(classifyArrangement(hissy, TEST_SAMPLE_RATE).mode).toBe("solo");
  });

  it("labels a band-style mix with percussion as dense", () => {
    const result = classifyArrangement(denseMix(), TEST_SAMPLE_RATE);
    expect(result.mode).toBe("dense");
  });
});

describe("buildRhythmColumns", () => {
  const segment = (root: number, suffix: string, start: number, end: number) => ({
    chordId: chordIdOf(root, suffix),
    name: "",
    startTime: start,
    endTime: end,
    confidence: 0.9,
  });

  it("renders each chord as its dictionary voicing", () => {
    const columns = buildRhythmColumns(
      [segment(0, "", 0, 2), segment(7, "", 2, 4)],
      [0, 2],
      120
    );
    expect(columns.length).toBeGreaterThanOrEqual(2);

    // First column: open C = x32010.
    const c = columns[0];
    const cByString = new Map(c.notes.map((n) => [n.string, n.fret]));
    expect(cByString.get(1)).toBe(3);
    expect(cByString.get(2)).toBe(2);
    expect(cByString.get(3)).toBe(0);
    expect(cByString.get(4)).toBe(1);
    expect(cByString.get(5)).toBe(0);
    expect(cByString.has(0)).toBe(false); // low E not played in open C

    // Column at the G change: open G = 320003.
    const g = columns.find((col) => col.time >= 2);
    expect(g).toBeDefined();
    const gByString = new Map(g!.notes.map((n) => [n.string, n.fret]));
    expect(gByString.get(0)).toBe(3);
    expect(gByString.get(1)).toBe(2);
    expect(gByString.get(5)).toBe(3);

    for (const col of columns) {
      for (const note of col.notes) {
        expect(STANDARD_TUNING[note.string] + note.fret).toBe(note.midi);
      }
    }
  });

  it("places strums at onsets, thinned to a playable rate", () => {
    const onsets = [0, 0.05, 0.5, 0.55, 1.0, 1.5];
    const columns = buildRhythmColumns([segment(9, "m", 0, 2)], onsets, 120);
    const times = columns.map((c) => c.time);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(0.2);
    }
    expect(times[0]).toBe(0);
  });

  it("falls back to a beat grid when onsets are missing", () => {
    const columns = buildRhythmColumns([segment(4, "", 0, 8)], [], 120);
    // 8s at 120 BPM, one strum per two beats = every 1s.
    expect(columns.length).toBeGreaterThanOrEqual(6);
  });
});

describe("dense-mix end to end", () => {
  it("detects the mix and still finds the progression for voicing tabs", () => {
    const result = analyzeAudio(denseMix(), TEST_SAMPLE_RATE);
    expect(result.arrangement.mode).toBe("dense");

    // Under heavy noise the exact quality can wobble (D vs D7); the root
    // progression must hold.
    const roots = result.chords
      .filter((s) => s.name !== "N" && s.endTime - s.startTime > 0.5)
      .map((s) => CHORDS[s.chordId].root);
    expect(roots).toEqual([4, 9, 2, 4]);

    const columns = buildRhythmColumns(
      result.chords,
      result.transcription.onsets,
      result.transcription.tempoBpm
    );
    expect(columns.length).toBeGreaterThan(0);
    // First voicing should be open E = 022100.
    const first = columns[0];
    const byString = new Map(first.notes.map((n) => [n.string, n.fret]));
    expect(byString.get(0)).toBe(0);
    expect(byString.get(1)).toBe(2);
    expect(byString.get(2)).toBe(2);
    expect(byString.get(3)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { analyzeAudio } from "../analysis/analyze";
import { estimateBeatGrid, snapToGrid } from "../analysis/beats";
import { buildChordChart, renderChartText } from "../chart";
import { findMainProgression } from "../theory/progression";
import { chordMidiNotes, concat, renderNotes, TEST_SAMPLE_RATE } from "./synth";

const MAJOR = [0, 4, 7];
const MINOR = [0, 3, 7];

describe("estimateBeatGrid", () => {
  it("recovers the beat phase from onsets", () => {
    const onsets = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75];
    const grid = estimateBeatGrid(onsets, 120); // beat = 0.5s
    expect(grid.beatSeconds).toBeCloseTo(0.5, 5);
    expect(grid.phase).toBeCloseTo(0.25, 2);
  });

  it("snaps near-grid times and leaves off-grid times alone", () => {
    const grid = { beatSeconds: 0.5, phase: 0 };
    expect(snapToGrid(1.02, grid)).toBeCloseTo(1.0, 5); // 20ms early -> on beat
    expect(snapToGrid(1.24, grid)).toBeCloseTo(1.25, 5); // near half-beat
    expect(snapToGrid(1.12, grid)).toBeCloseTo(1.12, 5); // genuinely off-grid
  });
});

describe("findMainProgression", () => {
  it("finds the repeating loop", () => {
    const seq = [1, 5, 9, 4, 1, 5, 9, 4, 1, 5, 9, 4, 7];
    const found = findMainProgression(seq);
    expect(found).not.toBeNull();
    expect(found!.chordIds).toEqual([1, 5, 9, 4]);
    expect(found!.repeats).toBe(3);
  });

  it("reduces periodic patterns to their cycle", () => {
    const found = findMainProgression([1, 5, 1, 5, 1, 5, 1, 5]);
    expect(found).not.toBeNull();
    expect(found!.chordIds).toEqual([1, 5]);
    expect(found!.repeats).toBe(4);
  });

  it("returns null when nothing repeats", () => {
    expect(findMainProgression([1, 2, 3, 4, 5, 6])).toBeNull();
  });
});

describe("buildChordChart", () => {
  const progression = () =>
    concat(
      [0, 7, 9, 5, 0, 7, 9, 5].map((root, i) =>
        renderNotes(chordMidiNotes(root, i % 4 === 2 ? MINOR : MAJOR), 2)
      )
    );

  it("detects the main progression and lays out bars", () => {
    const result = analyzeAudio(progression(), TEST_SAMPLE_RATE);
    const chart = buildChordChart(result);

    expect(chart.measures.length).toBeGreaterThan(4);
    expect(chart.mainProgression).not.toBeNull();
    expect(chart.mainProgression!.names).toEqual(["C", "G", "Am", "F"]);
    expect(chart.mainProgression!.numerals).toEqual(["I", "V", "vi", "IV"]);
    expect(chart.mainProgression!.repeats).toBe(2);

    // Every measure with content names real chords.
    for (const measure of chart.measures) {
      for (const entry of measure.entries) {
        expect(entry.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("renders a readable text chart", () => {
    const result = analyzeAudio(progression(), TEST_SAMPLE_RATE);
    const chart = buildChordChart(result);
    const text = renderChartText(result, chart, "Test song");

    expect(text).toContain("Key: C major");
    expect(text).toContain("Main progression: C - G - Am - F");
    expect(text).toContain("(I - V - vi - IV)");
    expect(text).toMatch(/\| .*C.* \|/);
  });
});

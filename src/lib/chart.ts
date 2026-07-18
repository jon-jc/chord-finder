/**
 * Bar-by-bar chord chart: the primary, musician-readable view of a song.
 * Shared between the on-screen chart and the plain-text export.
 */

import { estimateBeatGrid } from "./analysis/beats";
import type { AnalysisResult, ChordSegment } from "./analysis/types";
import { NO_CHORD_ID } from "./theory/chords";
import { findMainProgression } from "./theory/progression";
import type { MainProgression } from "./theory/progression";
import { romanNumeral } from "./theory/roman";

export interface ChartEntry {
  chordId: number;
  name: string;
  numeral: string;
  /** Fraction of the measure this chord occupies, 0..1. */
  weight: number;
}

export interface ChartMeasure {
  index: number;
  startTime: number;
  endTime: number;
  /** Chords sounding in this measure, longest first (max 2 kept). */
  entries: ChartEntry[];
}

export interface ChordChart {
  measures: ChartMeasure[];
  beatsPerMeasure: number;
  tempoBpm: number;
  mainProgression:
    | (MainProgression & { names: string[]; numerals: string[] })
    | null;
}

export function buildChordChart(result: AnalysisResult): ChordChart {
  const bpm = result.transcription.tempoBpm > 0 ? result.transcription.tempoBpm : 100;
  const grid = estimateBeatGrid(result.transcription.onsets, bpm);
  const measureSeconds = grid.beatSeconds * 4;
  // Bars align to the estimated beat grid (downbeat approximated by the
  // first beat of the grid).
  const firstBar = grid.phase;

  const measures: ChartMeasure[] = [];
  const overlap = (segment: ChordSegment, start: number, end: number) =>
    Math.max(0, Math.min(segment.endTime, end) - Math.max(segment.startTime, start));

  for (
    let start = firstBar, index = 0;
    start < result.duration - 0.05;
    start += measureSeconds, index++
  ) {
    const end = Math.min(result.duration, start + measureSeconds);
    const entries: ChartEntry[] = result.chords
      .filter((s) => s.chordId !== NO_CHORD_ID && overlap(s, start, end) > 0.05)
      .map((s) => ({
        chordId: s.chordId,
        name: s.name,
        numeral: romanNumeral(s.chordId, result.key),
        weight: overlap(s, start, end) / (end - start),
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2)
      // Display order: the chord that starts the measure first.
      .sort((a, b) => {
        const segA = result.chords.find((s) => s.chordId === a.chordId && overlap(s, start, end) > 0);
        const segB = result.chords.find((s) => s.chordId === b.chordId && overlap(s, start, end) > 0);
        return (segA?.startTime ?? 0) - (segB?.startTime ?? 0);
      });
    measures.push({ index, startTime: start, endTime: end, entries });
  }

  // Trim leading/trailing empty measures.
  while (measures.length > 0 && measures[0].entries.length === 0) measures.shift();
  while (measures.length > 0 && measures[measures.length - 1].entries.length === 0) {
    measures.pop();
  }
  measures.forEach((m, i) => (m.index = i));

  // Main progression from the (deduplicated) chord sequence.
  const sequence = result.chords
    .filter((s) => s.chordId !== NO_CHORD_ID)
    .map((s) => s.chordId);
  const deduped: number[] = [];
  for (const id of sequence) {
    if (deduped[deduped.length - 1] !== id) deduped.push(id);
  }
  const found = findMainProgression(deduped);
  const mainProgression = found
    ? {
        ...found,
        names: found.chordIds.map(
          (id) =>
            result.chords.find((s) => s.chordId === id)?.name ??
            String(id)
        ),
        numerals: found.chordIds.map((id) => romanNumeral(id, result.key)),
      }
    : null;

  return { measures, beatsPerMeasure: 4, tempoBpm: bpm, mainProgression };
}

/** Plain-text chord chart, four bars per line. */
export function renderChartText(
  result: AnalysisResult,
  chart: ChordChart,
  title: string
): string {
  const lines: string[] = [title, "=".repeat(Math.min(title.length, 60)), ""];
  lines.push(
    `Key: ${result.key.name} · ~${Math.round(chart.tempoBpm)} BPM · ${chart.beatsPerMeasure}/4` +
      (result.keyTimeline.length > 1
        ? ` · modulates: ${result.keyTimeline.map((s) => s.name).join(" -> ")}`
        : "")
  );
  if (chart.mainProgression) {
    lines.push(
      `Main progression: ${chart.mainProgression.names.join(" - ")}  (${chart.mainProgression.numerals.join(" - ")}) x${chart.mainProgression.repeats}`
    );
  }
  lines.push("");

  const cell = (measure: ChartMeasure) => {
    if (measure.entries.length === 0) return "%";
    return measure.entries.map((e) => e.name).join(" ");
  };
  const width = Math.max(4, ...chart.measures.map((m) => cell(m).length));

  for (let i = 0; i < chart.measures.length; i += 4) {
    const row = chart.measures.slice(i, i + 4);
    lines.push(
      "| " + row.map((m) => cell(m).padEnd(width, " ")).join(" | ") + " |"
    );
  }
  lines.push("");
  lines.push("% = previous chord continues / no chord");
  return lines.join("\n");
}

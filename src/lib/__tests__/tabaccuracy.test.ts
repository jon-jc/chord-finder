/**
 * End-to-end tab accuracy, validated against how published tab videos
 * notate the same musical situations:
 *  - let-ring fingerpicked arpeggios print each pluck once, in open
 *    position, with no ring-over duplicates and no garbage at the tail
 *  - lead phrases stay in one neck position
 *  - a whole multi-section song survives the full pipeline intact
 */

import { describe, expect, it } from "vitest";
import { analyzeAudio } from "../analysis/analyze";
import { mapToFretboard, MAX_FRET, STANDARD_TUNING } from "../tabs/fretboard";
import { layoutTab } from "../tabs/layout";
import { renderAsciiTab } from "../tabs/ascii";
import { chordMidiNotes, concat, renderNotes, TEST_SAMPLE_RATE } from "./synth";

/** Mix eighth-note plucks (with ring-out) into one buffer. */
function fingerpick(
  bars: number[][],
  eighthSeconds: number,
  ringFactor = 2.5
): Float32Array {
  const totalSeconds = bars.length * 8 * eighthSeconds + 1;
  const mix = new Float32Array(Math.ceil(totalSeconds * TEST_SAMPLE_RATE));
  bars.forEach((bar, barIdx) => {
    bar.forEach((midi, i) => {
      const start = (barIdx * 8 + i) * eighthSeconds;
      const tone = renderNotes([midi], eighthSeconds * ringFactor);
      const offset = Math.floor(start * TEST_SAMPLE_RATE);
      for (let s = 0; s < tone.length && offset + s < mix.length; s++) {
        mix[offset + s] += tone[s];
      }
    });
  });
  return mix;
}

describe("fingerpicked let-ring arpeggios", () => {
  const EIGHTH = 60 / 104 / 2;
  // Minor-key arpeggio figure in the style of published fingerpicking tabs:
  // Bm bars (B2 F#3 B3 D4 ...) and a G bar (G2 D3 B3 D4 ...).
  const BM_BAR = [47, 54, 59, 62, 59, 54, 59, 62];
  const G_BAR = [43, 50, 59, 62, 59, 50, 59, 62];
  const bars = [BM_BAR, BM_BAR, G_BAR, BM_BAR];

  it("prints each pluck about once — no ring-over duplicates, no tail garbage", () => {
    const audio = fingerpick(bars, EIGHTH);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    const notes = result.transcription.notes;

    // Ground truth: 32 plucks. Ring-over used to triple this; allow a
    // modest margin for onset jitter, not wholesale duplication.
    expect(notes.length).toBeGreaterThanOrEqual(20);
    expect(notes.length).toBeLessThanOrEqual(40);

    // Only pitches that were actually played may appear.
    const played = new Set(bars.flat());
    for (const note of notes) {
      expect(played.has(note.midi)).toBe(true);
    }

    // No two same-pitch notes closer than a real re-pluck allows.
    const byMidi = new Map<number, number[]>();
    for (const n of notes) {
      const list = byMidi.get(n.midi) ?? [];
      list.push(n.startTime);
      byMidi.set(n.midi, list);
    }
    for (const times of byMidi.values()) {
      for (let i = 1; i < times.length; i++) {
        expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(0.15);
      }
    }
  });

  it("maps to open position like published tabs (frets 0-4, bass on A/E)", () => {
    const audio = fingerpick(bars, EIGHTH);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    const columns = mapToFretboard(result.transcription.notes, result.chords);

    for (const column of columns) {
      for (const note of column.notes) {
        expect(STANDARD_TUNING[note.string] + note.fret).toBe(note.midi);
        expect(note.fret).toBeLessThanOrEqual(4); // open position
      }
    }

    // The signature positions of the figure, as a tab video notates them:
    // B2 = A|2, F#3 = D|4, G2 = E|3.
    const positionOf = (midi: number) => {
      for (const col of columns) {
        const hit = col.notes.find((n) => n.midi === midi);
        if (hit) return `${hit.string}:${hit.fret}`;
      }
      return null;
    };
    expect(positionOf(47)).toBe("1:2"); // A string, 2nd fret
    expect(positionOf(54)).toBe("2:4"); // D string, 4th fret
    expect(positionOf(43)).toBe("0:3"); // low E, 3rd fret
  });
});

describe("whole-song pipeline", () => {
  it("captures a full multi-section song end to end", () => {
    const MAJOR = [0, 4, 7];
    const MINOR = [0, 3, 7];
    const EIGHTH = 60 / 110 / 2;

    // Verse: fingerpicked Am arpeggio. Chorus: strummed C G Am F.
    // Bridge: low power chords. Repeated — about 2.4 minutes total.
    const verseBar = [45, 52, 57, 60, 57, 52, 57, 60]; // A2 E3 A3 C4 ...
    const verse = fingerpick([verseBar, verseBar, verseBar, verseBar], EIGHTH);
    const chorus = concat([
      renderNotes(chordMidiNotes(0, MAJOR), 2),
      renderNotes(chordMidiNotes(7, MAJOR), 2),
      renderNotes(chordMidiNotes(9, MINOR), 2),
      renderNotes(chordMidiNotes(5, MAJOR), 2),
    ]);
    const bridge = concat([
      renderNotes([40, 47, 52], 2), // E5
      renderNotes([43, 50, 55], 2), // G5
      renderNotes([45, 52, 57], 2), // A5
      renderNotes([40, 47, 52], 2),
    ]);
    const sections = [verse, chorus, verse, chorus, bridge, verse, chorus];
    const song = concat([...sections, ...sections]);

    const started = Date.now();
    const result = analyzeAudio(song, TEST_SAMPLE_RATE);
    const elapsed = (Date.now() - started) / 1000;
    expect(elapsed).toBeLessThan(60); // whole-song analysis stays fast

    const duration = song.length / TEST_SAMPLE_RATE;
    expect(duration).toBeGreaterThan(120); // it is actually a whole song

    // Chords found across the whole timeline, not just the start.
    const lastChord = result.chords[result.chords.length - 1];
    expect(lastChord.endTime).toBeCloseTo(duration, 0);
    const chordNames = new Set(result.chords.map((c) => c.name));
    expect(chordNames.has("Am")).toBe(true);
    expect(chordNames.has("C")).toBe(true);

    // Notes transcribed in every section (start, middle, end thirds).
    const notes = result.transcription.notes;
    expect(notes.length).toBeGreaterThan(100);
    for (const third of [0, 1, 2]) {
      const from = (duration / 3) * third;
      const to = (duration / 3) * (third + 1);
      expect(notes.some((n) => n.startTime >= from && n.startTime < to)).toBe(true);
    }

    // Tab spans the full song with valid, playable positions throughout.
    const columns = mapToFretboard(notes, result.chords);
    const layout = layoutTab(columns, result.chords, result.transcription.tempoBpm, duration);
    expect(layout.measures.length).toBeGreaterThan(50);
    const lastMeasure = layout.measures[layout.measures.length - 1];
    expect(lastMeasure.endTime).toBeGreaterThan(duration * 0.9);
    for (const column of columns) {
      for (const note of column.notes) {
        expect(note.fret).toBeGreaterThanOrEqual(0);
        expect(note.fret).toBeLessThanOrEqual(MAX_FRET);
        expect(STANDARD_TUNING[note.string] + note.fret).toBe(note.midi);
      }
    }

    // And it renders without falling over.
    const text = renderAsciiTab(layout, "Whole song");
    expect(text.length).toBeGreaterThan(2000);
    expect(text).toContain("e|");
  });
});

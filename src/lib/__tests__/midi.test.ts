import { describe, expect, it } from "vitest";
import { buildMidiFile } from "../midi/writer";
import { romanNumeral } from "../theory/roman";
import { CHORDS, chordName } from "../theory/chords";
import { analyzeAudio } from "../analysis/analyze";
import { chordMidiNotes, concat, renderNotes, TEST_SAMPLE_RATE } from "./synth";

/** Minimal SMF reader: header fields plus note-on counts per track. */
function parseMidi(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const ppq = view.getUint16(12);

  const tracks: { noteOns: number; noteOffs: number; midis: Set<number> }[] = [];
  let offset = 14;
  for (let t = 0; t < trackCount; t++) {
    expect(String.fromCharCode(...bytes.subarray(offset, offset + 4))).toBe("MTrk");
    const length = view.getUint32(offset + 4);
    const end = offset + 8 + length;
    let p = offset + 8;
    let running = 0;
    const info = { noteOns: 0, noteOffs: 0, midis: new Set<number>() };

    while (p < end) {
      // delta time VLQ
      while (bytes[p] & 0x80) p++;
      p++;
      let status = bytes[p];
      if (status & 0x80) {
        p++;
        running = status;
      } else {
        status = running;
      }
      if (status === 0xff) {
        const metaLength = bytes[p + 1];
        p += 2 + metaLength;
      } else if ((status & 0xf0) === 0x90) {
        info.noteOns++;
        info.midis.add(bytes[p]);
        p += 2;
      } else if ((status & 0xf0) === 0x80) {
        info.noteOffs++;
        p += 2;
      } else if ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0) {
        p += 1;
      } else {
        p += 2;
      }
    }
    tracks.push(info);
    offset = end;
  }
  return { magic, format, trackCount, ppq, tracks };
}

describe("buildMidiFile", () => {
  it("writes a valid format-1 file with notes and chords", () => {
    const audio = concat([
      renderNotes(chordMidiNotes(0, [0, 4, 7]), 1.6),
      renderNotes(chordMidiNotes(7, [0, 4, 7]), 1.6),
    ]);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    const bytes = buildMidiFile(result, { title: "test" });

    const parsed = parseMidi(bytes);
    expect(parsed.magic).toBe("MThd");
    expect(parsed.format).toBe(1);
    expect(parsed.trackCount).toBe(3);
    expect(parsed.ppq).toBe(480);

    const noteTrack = parsed.tracks[1];
    expect(noteTrack.noteOns).toBeGreaterThanOrEqual(6); // 2 chords x 3 notes
    expect(noteTrack.noteOns).toBe(noteTrack.noteOffs);
    expect(noteTrack.midis.has(48)).toBe(true); // C3

    const chordTrack = parsed.tracks[2];
    expect(chordTrack.noteOns).toBeGreaterThanOrEqual(8); // triad+bass x 2
    expect(chordTrack.noteOns).toBe(chordTrack.noteOffs);
  });

  it("handles long delta times via variable-length quantities", () => {
    const audio = concat([
      renderNotes([60], 0.4),
      new Float32Array(TEST_SAMPLE_RATE * 6), // 6s of silence
      renderNotes([64], 0.4),
    ]);
    const result = analyzeAudio(audio, TEST_SAMPLE_RATE);
    const bytes = buildMidiFile(result);
    const parsed = parseMidi(bytes);
    expect(parsed.magic).toBe("MThd");
    expect(parsed.tracks[1].midis.has(60)).toBe(true);
    expect(parsed.tracks[1].midis.has(64)).toBe(true);
  });
});

describe("romanNumeral", () => {
  const cMajor = {
    tonic: 0,
    mode: "major" as const,
    name: "C major",
    correlation: 0.9,
    confidence: 0.2,
    preferFlats: false,
    alternatives: [],
  };

  const findChord = (name: string) => {
    const chord = CHORDS.find((c) => c.root >= 0 && chordName(c) === name);
    if (!chord) throw new Error(`no chord ${name}`);
    return chord.id;
  };

  it("labels diatonic chords in C major", () => {
    expect(romanNumeral(findChord("C"), cMajor)).toBe("I");
    expect(romanNumeral(findChord("Dm"), cMajor)).toBe("ii");
    expect(romanNumeral(findChord("Em"), cMajor)).toBe("iii");
    expect(romanNumeral(findChord("F"), cMajor)).toBe("IV");
    expect(romanNumeral(findChord("G"), cMajor)).toBe("V");
    expect(romanNumeral(findChord("G7"), cMajor)).toBe("V7");
    expect(romanNumeral(findChord("Am"), cMajor)).toBe("vi");
    expect(romanNumeral(findChord("Bdim"), cMajor)).toBe("vii°");
  });

  it("labels borrowed chords with accidentals", () => {
    expect(romanNumeral(findChord("A#"), cMajor)).toBe("bVII"); // Bb major
    expect(romanNumeral(findChord("D#"), cMajor)).toBe("bIII"); // Eb major
  });
});

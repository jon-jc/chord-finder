/**
 * Standard MIDI File (format 1) writer — no dependencies.
 *
 * Produces three tracks:
 *   0: meta (tempo, time signature, key signature)
 *   1: transcribed notes (steel-string guitar)
 *   2: block chords from the chord analysis (piano)
 */

import type { AnalysisResult } from "../analysis/types";
import { CHORDS } from "../theory/chords";

const PPQ = 480;

class TrackBuilder {
  private bytes: number[] = [];
  private lastTick = 0;

  event(tick: number, data: number[]): void {
    let delta = Math.max(0, Math.round(tick) - this.lastTick);
    this.lastTick = Math.max(this.lastTick, Math.round(tick));
    // Variable-length quantity, most significant septet first.
    const stack: number[] = [delta & 0x7f];
    delta >>= 7;
    while (delta > 0) {
      stack.push((delta & 0x7f) | 0x80);
      delta >>= 7;
    }
    for (let i = stack.length - 1; i >= 0; i--) this.bytes.push(stack[i]);
    this.bytes.push(...data);
  }

  finish(): Uint8Array {
    this.event(this.lastTick, [0xff, 0x2f, 0x00]); // end of track
    const header = [
      0x4d, 0x54, 0x72, 0x6b, // "MTrk"
      (this.bytes.length >>> 24) & 0xff,
      (this.bytes.length >>> 16) & 0xff,
      (this.bytes.length >>> 8) & 0xff,
      this.bytes.length & 0xff,
    ];
    return Uint8Array.from([...header, ...this.bytes]);
  }
}

function textEvent(type: number, text: string): number[] {
  const encoded = Array.from(new TextEncoder().encode(text.slice(0, 127)));
  return [0xff, type, encoded.length, ...encoded];
}

/** Sharps (+) / flats (-) count on the circle of fifths for a key. */
function keySignatureSf(tonic: number, mode: "major" | "minor"): number {
  // C major / A minor = 0. Each fifth up adds a sharp.
  const reference = mode === "major" ? 0 : 9;
  let sf = 0;
  let pc = reference;
  for (let i = 0; i < 12; i++) {
    if (pc === tonic) break;
    pc = (pc + 7) % 12;
    sf++;
  }
  if (sf > 6) sf -= 12; // prefer flats past 6 sharps
  return sf;
}

export interface MidiOptions {
  /** Include the block-chord track. */
  includeChords?: boolean;
  /** Include the transcribed note track. */
  includeNotes?: boolean;
  title?: string;
}

export function buildMidiFile(
  result: AnalysisResult,
  options: MidiOptions = {}
): Uint8Array {
  const { includeChords = true, includeNotes = true, title = "ChordLab export" } = options;

  const bpm = result.transcription.tempoBpm > 0 ? result.transcription.tempoBpm : 100;
  const secondsToTicks = (s: number) => (s * bpm * PPQ) / 60;

  // --- Track 0: meta ---
  const meta = new TrackBuilder();
  meta.event(0, textEvent(0x03, title));
  const usPerQuarter = Math.round(60_000_000 / bpm);
  meta.event(0, [
    0xff, 0x51, 0x03,
    (usPerQuarter >>> 16) & 0xff,
    (usPerQuarter >>> 8) & 0xff,
    usPerQuarter & 0xff,
  ]);
  meta.event(0, [0xff, 0x58, 0x04, 4, 2, 24, 8]); // 4/4
  const sf = keySignatureSf(result.key.tonic, result.key.mode);
  meta.event(0, [0xff, 0x59, 0x02, sf & 0xff, result.key.mode === "minor" ? 1 : 0]);

  const tracks: Uint8Array[] = [meta.finish()];

  // --- Track 1: transcribed notes ---
  if (includeNotes && result.transcription.notes.length > 0) {
    const track = new TrackBuilder();
    track.event(0, textEvent(0x03, "Transcription"));
    track.event(0, [0xc0, 25]); // program: steel-string acoustic guitar

    const events: { tick: number; data: number[]; order: number }[] = [];
    for (const note of result.transcription.notes) {
      const velocity = Math.max(20, Math.min(127, Math.round(note.velocity * 112)));
      const startTick = secondsToTicks(note.startTime);
      const endTick = Math.max(startTick + PPQ / 8, secondsToTicks(note.endTime));
      events.push({ tick: startTick, data: [0x90, note.midi, velocity], order: 1 });
      events.push({ tick: endTick, data: [0x80, note.midi, 0], order: 0 });
    }
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    for (const e of events) track.event(e.tick, e.data);
    tracks.push(track.finish());
  }

  // --- Track 2: block chords ---
  if (includeChords) {
    const track = new TrackBuilder();
    track.event(0, textEvent(0x03, "Chords"));
    track.event(0, [0xc1, 0]); // program: acoustic grand piano, channel 1

    const events: { tick: number; data: number[]; order: number }[] = [];
    for (const segment of result.chords) {
      const chord = CHORDS[segment.chordId];
      if (!chord.quality || chord.root < 0) continue;
      const velocity = Math.max(30, Math.min(100, Math.round(segment.confidence * 100)));
      const startTick = secondsToTicks(segment.startTime);
      const endTick = Math.max(
        startTick + PPQ / 4,
        secondsToTicks(segment.endTime) - PPQ / 16
      );
      const rootMidi = 48 + chord.root; // C3-based voicing
      for (const interval of chord.quality.intervals) {
        const midi = rootMidi + interval;
        events.push({ tick: startTick, data: [0x91, midi, velocity], order: 1 });
        events.push({ tick: endTick, data: [0x81, midi, 0], order: 0 });
      }
      // Bass root an octave below.
      events.push({ tick: startTick, data: [0x91, rootMidi - 12, velocity], order: 1 });
      events.push({ tick: endTick, data: [0x81, rootMidi - 12, 0], order: 0 });
    }
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    for (const e of events) track.event(e.tick, e.data);
    tracks.push(track.finish());
  }

  // --- File header ---
  const header = Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0, 0, 0, 6,
    0, 1, // format 1
    (tracks.length >>> 8) & 0xff, tracks.length & 0xff,
    (PPQ >>> 8) & 0xff, PPQ & 0xff,
  ]);

  const total = header.length + tracks.reduce((sum, t) => sum + t.length, 0);
  const file = new Uint8Array(total);
  file.set(header, 0);
  let offset = header.length;
  for (const track of tracks) {
    file.set(track, offset);
    offset += track.length;
  }
  return file;
}

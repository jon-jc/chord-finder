/**
 * Note-level transcription: onsets + polyphonic pitch estimation
 * -> timed note events suitable for tabs and MIDI.
 */

import { CHORDS } from "../theory/chords";
import { detectOnsets } from "./onsets";
import { estimatePitches } from "./pitches";

export interface NoteEvent {
  midi: number;
  startTime: number;
  endTime: number;
  /** 0..1 relative strength (used for MIDI velocity). */
  velocity: number;
}

/** Minimal view of a chord segment used as a transcription prior. */
export interface ChordSpan {
  chordId: number;
  startTime: number;
  endTime: number;
}

export interface Transcription {
  notes: NoteEvent[];
  onsets: number[];
  tempoBpm: number;
}

export interface TranscribeOptions {
  tuningCents?: number;
  maxPolyphony?: number;
  /** Detected chords; used as a harmonic prior for pitch estimation. */
  chords?: ChordSpan[];
  onProgress?: (fraction: number) => void;
}

/** Pitch classes (root + chord tones) of the chord sounding at `time`. */
function chordPcsAt(chords: ChordSpan[], time: number): number[] {
  const span = chords.find((c) => time >= c.startTime && time < c.endTime);
  if (!span) return [];
  const chord = CHORDS[span.chordId];
  if (!chord || chord.root < 0 || !chord.quality) return [];
  return chord.quality.intervals.map((iv) => (chord.root + iv) % 12);
}

const MIN_SEGMENT_SECONDS = 0.08;
const MAX_NOTE_SECONDS = 4;

export function transcribeNotes(
  signal: Float32Array,
  sampleRate: number,
  options: TranscribeOptions = {}
): Transcription {
  const { tuningCents = 0, maxPolyphony = 6, chords = [], onProgress } = options;

  const { onsets, tempoBpm } = detectOnsets(signal, sampleRate);
  onProgress?.(0.25);

  const duration = signal.length / sampleRate;

  // Segment boundaries: every onset starts a segment; if the file has no
  // detectable onsets (pads, sustained chords) fall back to a coarse grid.
  const starts = onsets.length > 0 ? [...onsets] : [];
  if (starts.length === 0) {
    for (let t = 0; t < duration; t += 1) starts.push(t);
  }

  const notes: NoteEvent[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = Math.min(
      i + 1 < starts.length ? starts[i + 1] : duration,
      start + MAX_NOTE_SECONDS
    );
    if (end - start < MIN_SEGMENT_SECONDS) continue;

    const from = Math.floor(start * sampleRate);
    const to = Math.min(signal.length, Math.ceil(end * sampleRate));
    const segment = signal.subarray(from, to);

    const pitches = estimatePitches(segment, sampleRate, {
      tuningCents,
      maxPolyphony,
      preferredPcs: chordPcsAt(chords, (start + end) / 2),
    });
    for (const pitch of pitches) {
      notes.push({
        midi: pitch.midi,
        startTime: start,
        endTime: end,
        velocity: Math.max(0.25, pitch.strength),
      });
    }
    onProgress?.(0.25 + 0.75 * ((i + 1) / starts.length));
  }

  return { notes: mergeContinuations(notes), onsets, tempoBpm };
}

/**
 * A note that keeps ringing across a neighbor's onset shows up again in the
 * next segment at the same pitch but weaker (it is decaying). Merge such
 * back-to-back detections into one longer note instead of re-striking it.
 */
function mergeContinuations(notes: NoteEvent[]): NoteEvent[] {
  const byPitch = new Map<number, NoteEvent[]>();
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  const out: NoteEvent[] = [];

  for (const note of sorted) {
    const previousOfPitch = byPitch.get(note.midi);
    const last = previousOfPitch?.[previousOfPitch.length - 1];
    if (
      last &&
      Math.abs(note.startTime - last.endTime) < 0.03 &&
      note.velocity <= last.velocity * 0.75
    ) {
      last.endTime = note.endTime;
      continue;
    }
    const copy = { ...note };
    out.push(copy);
    if (previousOfPitch) previousOfPitch.push(copy);
    else byPitch.set(note.midi, [copy]);
  }

  return out.sort((a, b) => a.startTime - b.startTime || a.midi - b.midi);
}

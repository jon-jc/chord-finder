/**
 * Note-level transcription: onsets + polyphonic pitch estimation
 * -> timed note events suitable for tabs and MIDI.
 *
 * Sustained ("let ring") notes are tracked across onset segments by raw
 * salience: a pitch that reappears in the next segment counts as a new
 * note only if its energy came back up (a re-attack); a decaying
 * reappearance just extends the ringing note. This is what keeps
 * fingerpicked tabs from printing every ringing string at every pluck.
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

const MIN_SEGMENT_SECONDS = 0.08;
const MAX_NOTE_SECONDS = 4;
/** Segments quieter than this fraction of the loudest are ring-out/silence. */
const SEGMENT_RMS_GATE = 0.06;
/** A reappearing pitch is a re-attack only above this fraction of its old salience. */
const REATTACK_RATIO = 0.85;
/**
 * A same-pitch re-attack faster than this is really the same attack split
 * across a spurious onset boundary (the ear can't re-pluck this fast into
 * a ringing string without muting it first).
 */
const MIN_REATTACK_SECONDS = 0.16;
/**
 * Weak non-chord tones below this fraction of the segment peak are junk.
 * Genuine passing/melody notes dominate their own onset segment, so a
 * fairly high bar here removes artifacts without eating real notes.
 */
const JUNK_RATIO = 0.55;

/**
 * Pitch classes (root + chord tones) of the chord sounding at `time`.
 * During no-chord stretches (ring-out tails, pauses) the harmony of the
 * most recent chord still applies — ringing strings keep sounding it.
 */
function chordPcsAt(chords: ChordSpan[], time: number): number[] {
  let span = chords.find((c) => time >= c.startTime && time < c.endTime);
  const isReal = (s: ChordSpan | undefined) =>
    s && CHORDS[s.chordId]?.root >= 0 && CHORDS[s.chordId]?.quality;
  if (!isReal(span)) {
    span = [...chords]
      .filter((c) => c.startTime <= time && isReal(c))
      .pop();
  }
  if (!span) return [];
  const chord = CHORDS[span.chordId];
  if (!chord || chord.root < 0 || !chord.quality) return [];
  return chord.quality.intervals.map((iv) => (chord.root + iv) % 12);
}

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

  interface Segment {
    start: number;
    end: number;
    rms: number;
  }
  const segments: Segment[] = [];
  let maxRms = 0;
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = Math.min(
      i + 1 < starts.length ? starts[i + 1] : duration,
      start + MAX_NOTE_SECONDS
    );
    if (end - start < MIN_SEGMENT_SECONDS) continue;
    const from = Math.floor(start * sampleRate);
    const to = Math.min(signal.length, Math.ceil(end * sampleRate));
    let sumSquares = 0;
    for (let s = from; s < to; s++) sumSquares += signal[s] * signal[s];
    const rms = Math.sqrt(sumSquares / Math.max(1, to - from));
    maxRms = Math.max(maxRms, rms);
    segments.push({ start, end, rms });
  }
  const rmsGate = maxRms * SEGMENT_RMS_GATE;

  const notes: NoteEvent[] = [];
  /** Ringing notes still open, keyed by midi, with their last salience. */
  const ringing = new Map<number, { note: NoteEvent; salience: number }>();
  let prevRms = 0;

  for (let i = 0; i < segments.length; i++) {
    const { start, end, rms } = segments[i];

    // A real pluck adds energy. A segment quieter than the previous one is
    // decay only — ringing notes may extend, but nothing new can start
    // (kills phantom onsets detected inside ring-out).
    const decayOnly = i > 0 && rms < prevRms * 0.85;
    prevRms = rms;

    if (rms < rmsGate) {
      // Ring-out or silence: nothing new can start; let open notes decay.
      for (const entry of ringing.values()) entry.salience *= 0.6;
      onProgress?.(0.25 + 0.75 * ((i + 1) / segments.length));
      continue;
    }

    const from = Math.floor(start * sampleRate);
    const to = Math.min(signal.length, Math.ceil(end * sampleRate));
    const pitches = estimatePitches(signal.subarray(from, to), sampleRate, {
      tuningCents,
      maxPolyphony,
      preferredPcs: chordPcsAt(chords, (start + end) / 2),
    });

    const preferred = new Set(chordPcsAt(chords, (start + end) / 2));
    const peakSalience = pitches.reduce((m, p) => Math.max(m, p.salience), 0);
    const seenNow = new Set<number>();

    for (const pitch of pitches) {
      // Junk gate: weak notes outside the harmony are almost always
      // estimation residue, not something anyone played.
      const isChordTone =
        preferred.size === 0 || preferred.has(((pitch.midi % 12) + 12) % 12);
      if (!isChordTone && pitch.salience < peakSalience * JUNK_RATIO) continue;

      // Octave-ghost gate: a "new" pitch exactly an octave from a note
      // that is already ringing is usually spectral leakage of that note —
      // unless it arrives with real energy of its own. A sub-octave ghost
      // is especially cheap to fake (every even harmonic coincides with
      // the ringing note's partials), so a bass entry under a ringing note
      // must be at least as salient as the ring itself. Genuine octave
      // doublings in a strum attack together and are unaffected.
      const above = ringing.get(pitch.midi + 12);
      const below = ringing.get(pitch.midi - 12);
      if (!ringing.has(pitch.midi)) {
        if (above && pitch.salience < above.salience * 1.0) continue;
        if (below && pitch.salience < below.salience * 0.75) continue;
      }

      seenNow.add(pitch.midi);
      const open = ringing.get(pitch.midi);
      if (
        open &&
        (decayOnly ||
          pitch.salience < open.salience * REATTACK_RATIO ||
          start - open.note.startTime < MIN_REATTACK_SECONDS)
      ) {
        // Still the same ringing note: extend it.
        open.note.endTime = end;
        open.salience = Math.max(open.salience, pitch.salience);
        continue;
      }
      if (decayOnly && !open) continue; // nothing new can start in decay
      // New note (or re-attack of the same pitch).
      if (open) open.note.endTime = start;
      const note: NoteEvent = {
        midi: pitch.midi,
        startTime: start,
        endTime: end,
        velocity: Math.max(0.25, pitch.strength),
      };
      notes.push(note);
      ringing.set(pitch.midi, { note, salience: pitch.salience });
    }

    // Pitches that vanished have stopped sounding.
    for (const midi of [...ringing.keys()]) {
      if (!seenNow.has(midi)) ringing.delete(midi);
    }

    onProgress?.(0.25 + 0.75 * ((i + 1) / segments.length));
  }

  // Precursor-ghost sweep: when an onset fires slightly early, the
  // analysis window straddles the incoming attack and can misread its
  // partial energy an octave low; the real note then lands in the next
  // segment. Such ghosts are short-lived and immediately followed by a
  // fresh note an octave up — drop them.
  const cleaned = notes.filter((n) => {
    if (n.endTime - n.startTime > 0.3) return true;
    return !notes.some(
      (m) =>
        m.midi === n.midi + 12 &&
        m.startTime > n.startTime &&
        m.startTime - n.startTime < 0.2
    );
  });

  cleaned.sort((a, b) => a.startTime - b.startTime || a.midi - b.midi);
  return { notes: cleaned, onsets, tempoBpm };
}

import type { KeyEstimate, KeySpan } from "../theory/key";
import type { Arrangement } from "./arrangement";
import type { Transcription } from "./transcribe";

export interface ChordSegment {
  /** Chord id into CHORDS, or NO_CHORD_ID. */
  chordId: number;
  /** Display name, spelled for the detected key (e.g. "Bb", "F#m7/A"). */
  name: string;
  /** Sounding bass pitch class (equals the root unless inverted). */
  bassPc?: number;
  startTime: number;
  endTime: number;
  /** Mean per-frame template score over the segment, in [0, 1]. */
  confidence: number;
}

export interface AnalysisResult {
  key: KeyEstimate;
  /** Local keys over time; more than one entry means the piece modulates. */
  keyTimeline: KeySpan[];
  /** Solo recording vs dense mix — decides the default tab style. */
  arrangement: Arrangement;
  chords: ChordSegment[];
  transcription: Transcription;
  /** Downsampled chromagram for visualization: frames x 12. */
  chromagram: Float32Array[];
  chromaTimes: Float32Array;
  tuningCents: number;
  duration: number;
  sampleRate: number;
}

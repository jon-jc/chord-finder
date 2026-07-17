import type { KeyEstimate } from "../theory/key";
import type { Transcription } from "./transcribe";

export interface ChordSegment {
  /** Chord id into CHORDS, or NO_CHORD_ID. */
  chordId: number;
  /** Display name, spelled for the detected key (e.g. "Bb", "F#m7"). */
  name: string;
  startTime: number;
  endTime: number;
  /** Mean per-frame template score over the segment, in [0, 1]. */
  confidence: number;
}

export interface AnalysisResult {
  key: KeyEstimate;
  chords: ChordSegment[];
  transcription: Transcription;
  /** Downsampled chromagram for visualization: frames x 12. */
  chromagram: Float32Array[];
  chromaTimes: Float32Array;
  tuningCents: number;
  duration: number;
  sampleRate: number;
}

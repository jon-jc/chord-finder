/**
 * Offline chord/key analysis of a mono PCM buffer.
 */

import { computeChromagram } from "../dsp/chroma";
import {
  CHORDS,
  NO_CHORD_ID,
  chordNameById,
  scoreFrame,
} from "../theory/chords";
import { viterbiDecode } from "../theory/viterbi";
import { detectKey } from "../theory/key";
import type { AnalysisResult, ChordSegment } from "./types";

export interface AnalyzeOptions {
  /** Silence gate as a fraction of the maximum frame RMS. */
  silenceRatio?: number;
  /** Segments shorter than this are merged into their neighbors. */
  minSegmentSeconds?: number;
  /** Viterbi self-transition probability. */
  selfTransition?: number;
  /** Viterbi emission sharpening exponent. */
  emissionPower?: number;
  onProgress?: (fraction: number) => void;
}

/**
 * Analyze mono PCM: chord segments + key + chromagram.
 * The recommended sample rate is 22050 Hz (resample before calling).
 */
export function analyzeAudio(
  signal: Float32Array,
  sampleRate: number,
  options: AnalyzeOptions = {}
): AnalysisResult {
  const {
    silenceRatio = 0.03,
    minSegmentSeconds = 0.3,
    selfTransition = 0.85,
    emissionPower = 10,
    onProgress,
  } = options;

  onProgress?.(0.05);
  const chromagram = computeChromagram(signal, sampleRate);
  const { frames, hopSeconds, tuningCents } = chromagram;
  onProgress?.(0.55);

  let maxRms = 0;
  for (const frame of frames) maxRms = Math.max(maxRms, frame.rms);
  const silenceGate = maxRms * silenceRatio;

  // Score all frames; silent frames get a zeroed chroma so N wins cleanly.
  const zeroChroma = new Float32Array(12);
  const frameScores: Float32Array[] = frames.map((frame) =>
    scoreFrame(frame.rms < silenceGate ? zeroChroma : frame.chroma)
  );
  onProgress?.(0.7);

  const path = viterbiDecode(frameScores, { selfTransition, emissionPower });
  onProgress?.(0.85);

  // Key: energy-weighted aggregate chroma over non-silent frames.
  const aggregate = new Float64Array(12);
  for (const frame of frames) {
    if (frame.rms < silenceGate) continue;
    for (let i = 0; i < 12; i++) aggregate[i] += frame.chroma[i] * frame.rms;
  }
  const key = detectKey(aggregate);

  const duration = signal.length / sampleRate;
  const segments = buildSegments(
    path,
    frameScores,
    hopSeconds,
    duration,
    minSegmentSeconds,
    key.preferFlats
  );
  onProgress?.(1);

  return {
    key,
    chords: segments,
    chromagram: frames.map((f) => f.chroma),
    chromaTimes: Float32Array.from(frames, (f) => f.time),
    tuningCents,
    duration,
    sampleRate,
  };
}

function buildSegments(
  path: Int32Array,
  frameScores: Float32Array[],
  hopSeconds: number,
  duration: number,
  minSegmentSeconds: number,
  preferFlats: boolean
): ChordSegment[] {
  interface RawSegment {
    chordId: number;
    startFrame: number;
    endFrame: number; // exclusive
  }

  const raw: RawSegment[] = [];
  for (let t = 0; t < path.length; t++) {
    const last = raw[raw.length - 1];
    if (last && last.chordId === path[t]) {
      last.endFrame = t + 1;
    } else {
      raw.push({ chordId: path[t], startFrame: t, endFrame: t + 1 });
    }
  }

  // Absorb segments that are too short into the longer neighbor.
  const minFrames = Math.max(1, Math.round(minSegmentSeconds / hopSeconds));
  let changed = true;
  while (changed && raw.length > 1) {
    changed = false;
    for (let i = 0; i < raw.length; i++) {
      const seg = raw[i];
      if (seg.endFrame - seg.startFrame >= minFrames) continue;
      const prev = raw[i - 1];
      const next = raw[i + 1];
      const prevLen = prev ? prev.endFrame - prev.startFrame : -1;
      const nextLen = next ? next.endFrame - next.startFrame : -1;
      if (prevLen < 0 && nextLen < 0) break;
      if (prevLen >= nextLen) {
        prev.endFrame = seg.endFrame;
      } else {
        next.startFrame = seg.startFrame;
      }
      raw.splice(i, 1);
      changed = true;
      break;
    }
  }

  // Re-merge identical neighbors created by the absorption step.
  const merged: RawSegment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.chordId === seg.chordId) {
      last.endFrame = seg.endFrame;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged.map((seg, index) => {
    let scoreSum = 0;
    for (let t = seg.startFrame; t < seg.endFrame; t++) {
      scoreSum += frameScores[t][seg.chordId];
    }
    const frameLen = seg.endFrame - seg.startFrame;
    const isLast = index === merged.length - 1;
    return {
      chordId: seg.chordId,
      name: chordNameById(seg.chordId, preferFlats),
      startTime: seg.startFrame * hopSeconds,
      endTime: isLast ? duration : seg.endFrame * hopSeconds,
      confidence: Math.min(1, scoreSum / frameLen),
    };
  });
}

export { CHORDS, NO_CHORD_ID };

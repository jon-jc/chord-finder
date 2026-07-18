/**
 * Offline chord/key analysis of a mono PCM buffer.
 *
 * Decoding is two-pass:
 *   1. Bass-aware template scores are decoded with a musically-informed
 *      transition matrix (root motion by fourths/fifths is cheap, tritones
 *      expensive). The resulting progression provides chord-sequence
 *      evidence for key detection.
 *   2. The detected key feeds a diatonic prior back into the emissions and
 *      the decode is repeated, cleaning up out-of-key confusions.
 *
 * Segments then get slash-chord (inversion) labels from the bass register,
 * and a windowed key pass tracks modulations.
 */

import { computeChromagram } from "../dsp/chroma";
import type { ChromaFrame } from "../dsp/chroma";
import {
  CHORDS,
  NO_CHORD_ID,
  buildChordTransitions,
  chordDiatonicity,
  chordNameWithBass,
  scoreFrame,
} from "../theory/chords";
import { viterbiDecodeFull } from "../theory/viterbi";
import { detectKey, detectKeyTimeline, keyIndex } from "../theory/key";
import type { KeyEstimate } from "../theory/key";
import { transcribeNotes } from "./transcribe";
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
 * Analyze mono PCM: chord segments + key(s) + chromagram + transcription.
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
  onProgress?.(0.3);

  let maxRms = 0;
  for (const frame of frames) maxRms = Math.max(maxRms, frame.rms);
  const silenceGate = maxRms * silenceRatio;

  // Score all frames; silent frames get a zeroed chroma so N wins cleanly.
  const zeroChroma = new Float32Array(12);
  const frameScores: Float32Array[] = frames.map((frame) =>
    frame.rms < silenceGate
      ? scoreFrame(zeroChroma)
      : scoreFrame(frame.chroma, frame.bassChroma)
  );
  onProgress?.(0.38);

  const transitions = buildChordTransitions(selfTransition);

  // --- Pass 1: key-agnostic decode ---------------------------------------
  const firstPath = viterbiDecodeFull(frameScores, transitions, {
    emissionPower,
  });
  onProgress?.(0.46);

  // Key evidence 1: energy-weighted aggregate chroma over non-silent frames.
  const aggregate = new Float64Array(12);
  for (const frame of frames) {
    if (frame.rms < silenceGate) continue;
    for (let i = 0; i < 12; i++) aggregate[i] += frame.chroma[i] * frame.rms;
  }

  // Key evidence 2: how well the decoded progression fits each candidate key.
  const chordEvidence = computeChordEvidence(firstPath, hopSeconds);
  const key = detectKey(aggregate, chordEvidence);
  onProgress?.(0.5);

  // --- Pass 2: decode again with a diatonic prior toward the found key ---
  const diatonicBonus = new Float64Array(CHORDS.length);
  for (let c = 0; c < CHORDS.length; c++) {
    diatonicBonus[c] =
      c === NO_CHORD_ID
        ? 1
        : 0.93 + 0.07 * chordDiatonicity(c, key.tonic, key.mode);
  }
  const keyAwareScores = frameScores.map((scores) => {
    const adjusted = new Float32Array(scores.length);
    for (let c = 0; c < scores.length; c++) {
      adjusted[c] = scores[c] * diatonicBonus[c];
    }
    return adjusted;
  });
  const path = viterbiDecodeFull(keyAwareScores, transitions, { emissionPower });
  onProgress?.(0.56);

  const duration = signal.length / sampleRate;
  const segments = buildSegments(
    path,
    frameScores,
    frames,
    hopSeconds,
    duration,
    minSegmentSeconds,
    key
  );

  // Windowed local keys; chroma windows alone can be ambiguous, so a
  // non-modulating piece snaps to the (chord-evidence-informed) global key.
  let keyTimeline = detectKeyTimeline(frames, duration);
  if (keyTimeline.length <= 1) {
    keyTimeline = [
      {
        startTime: 0,
        endTime: duration,
        tonic: key.tonic,
        mode: key.mode,
        name: key.name,
      },
    ];
  }
  onProgress?.(0.6);

  const transcription = transcribeNotes(signal, sampleRate, {
    tuningCents,
    chords: segments,
    onProgress: (fraction) => onProgress?.(0.6 + 0.4 * fraction),
  });
  onProgress?.(1);

  return {
    key,
    keyTimeline,
    chords: segments,
    transcription,
    chromagram: frames.map((f) => f.chroma),
    chromaTimes: Float32Array.from(frames, (f) => f.time),
    tuningCents,
    duration,
    sampleRate,
  };
}

/**
 * Duration-weighted support for each of the 24 keys from a decoded chord
 * path: diatonic chords count toward a key, tonic/subdominant/dominant
 * roots count extra, and a tonic chord whose third matches the mode counts
 * the most.
 */
function computeChordEvidence(path: Int32Array, hopSeconds: number): Float64Array {
  const evidence = new Float64Array(24);

  // Cache per-chord contributions across all 24 keys.
  const cache = new Map<number, Float64Array>();
  const contributionsFor = (chordId: number): Float64Array => {
    let contrib = cache.get(chordId);
    if (contrib) return contrib;
    contrib = new Float64Array(24);
    const chord = CHORDS[chordId];
    if (chord.root >= 0 && chord.quality) {
      for (let tonic = 0; tonic < 12; tonic++) {
        for (const mode of ["major", "minor"] as const) {
          const diatonicity = chordDiatonicity(chordId, tonic, mode);
          if (diatonicity < 1) {
            // Only fully diatonic chords vote; partial fits are ambiguous.
            continue;
          }
          let weight = 1;
          const degree = (((chord.root - tonic) % 12) + 12) % 12;
          if (degree === 5 || degree === 7) weight = 1.2; // IV / V
          if (degree === 0) {
            weight = 1.3;
            const third = chord.quality.intervals[1] ?? 4;
            const modeThird = mode === "major" ? 4 : 3;
            if (third === modeThird) weight = 1.6; // true tonic chord
          }
          contrib[keyIndex(tonic, mode)] = weight;
        }
      }
    }
    cache.set(chordId, contrib);
    return contrib;
  };

  for (let t = 0; t < path.length; t++) {
    if (path[t] === NO_CHORD_ID) continue;
    const contrib = contributionsFor(path[t]);
    for (let k = 0; k < 24; k++) evidence[k] += contrib[k] * hopSeconds;
  }
  return evidence;
}

function buildSegments(
  path: Int32Array,
  frameScores: Float32Array[],
  frames: ChromaFrame[],
  hopSeconds: number,
  duration: number,
  minSegmentSeconds: number,
  key: KeyEstimate
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

    const bassPc = detectSegmentBass(frames, seg.startFrame, seg.endFrame, seg.chordId);

    return {
      chordId: seg.chordId,
      name: chordNameWithBass(seg.chordId, bassPc, key.preferFlats),
      bassPc,
      startTime: seg.startFrame * hopSeconds,
      endTime: isLast ? duration : seg.endFrame * hopSeconds,
      confidence: Math.min(1, scoreSum / frameLen),
    };
  });
}

/**
 * Dominant bass pitch class of a segment, if it is a chord tone and clearly
 * dominates the root in the bass register (=> an inversion worth labeling).
 * Returns the root itself for root-position chords, undefined for no-chord
 * or bass-less segments.
 */
function detectSegmentBass(
  frames: ChromaFrame[],
  startFrame: number,
  endFrame: number,
  chordId: number
): number | undefined {
  const chord = CHORDS[chordId];
  if (!chord.quality || chord.root < 0) return undefined;

  const bassSum = new Float64Array(12);
  let total = 0;
  for (let t = startFrame; t < endFrame && t < frames.length; t++) {
    const bass = frames[t].bassChroma;
    for (let i = 0; i < 12; i++) {
      bassSum[i] += bass[i];
      total += bass[i];
    }
  }
  if (total <= 0) return undefined;

  let bestPc = 0;
  for (let i = 1; i < 12; i++) {
    if (bassSum[i] > bassSum[bestPc]) bestPc = i;
  }

  if (bestPc === chord.root) return chord.root;
  const interval = (((bestPc - chord.root) % 12) + 12) % 12;
  const isChordTone = chord.quality.intervals.includes(interval);
  // Require clear dominance before labeling an inversion.
  if (isChordTone && bassSum[bestPc] > 1.35 * bassSum[chord.root]) {
    return bestPc;
  }
  return chord.root;
}

export { CHORDS, NO_CHORD_ID };

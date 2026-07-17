"use client";

/**
 * Real-time chord recognition from the microphone.
 *
 * An AudioContext is opened at the analysis sample rate (the browser
 * resamples the mic stream for us) and an AnalyserNode is polled every
 * ~120ms for the most recent 8192 samples — exactly one chroma frame.
 * Scores are exponentially smoothed and the displayed chord uses a small
 * hysteresis so it never flickers between neighbors.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { computeChromagram } from "../lib/dsp/chroma";
import {
  CHORDS,
  NO_CHORD_ID,
  chordNameById,
  scoreFrame,
} from "../lib/theory/chords";
import { detectKey, type KeyEstimate } from "../lib/theory/key";

export interface LiveChordEvent {
  chordId: number;
  name: string;
  startedAt: number; // seconds since session start
}

export interface LiveState {
  status: "idle" | "starting" | "listening" | "denied" | "error";
  chordId: number;
  chordName: string;
  confidence: number;
  /** Latest 12-bin chroma for visualization. */
  chroma: Float32Array;
  /** 0..1 input level. */
  level: number;
  /** Running key estimate (null until enough evidence accumulates). */
  keyEstimate: KeyEstimate | null;
  /** Recent chord changes, oldest first. */
  history: LiveChordEvent[];
}

const FRAME_SIZE = 8192;
const SAMPLE_RATE = 22050;
const TICK_MS = 120;
const SCORE_SMOOTHING = 0.65; // weight of previous smoothed scores
const SWITCH_TICKS = 2; // consecutive ticks a new chord must win before display
const LEVEL_GATE = 0.008; // absolute RMS floor
const MAX_HISTORY = 24;

const INITIAL: LiveState = {
  status: "idle",
  chordId: NO_CHORD_ID,
  chordName: "N",
  confidence: 0,
  chroma: new Float32Array(12),
  level: 0,
  keyEstimate: null,
  history: [],
};

export function useLiveChords() {
  const [state, setState] = useState<LiveState>(INITIAL);
  const sessionRef = useRef<{
    stream: MediaStream;
    context: AudioContext;
    timer: number;
  } | null>(null);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      clearInterval(session.timer);
      session.stream.getTracks().forEach((t) => t.stop());
      void session.context.close();
      sessionRef.current = null;
    }
    setState(INITIAL);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setState({ ...INITIAL, status: "starting" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
    } catch (error) {
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");
      setState({ ...INITIAL, status: denied ? "denied" : "error" });
      return;
    }

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = FRAME_SIZE;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);

    const buffer = new Float32Array(FRAME_SIZE);
    const smoothedScores = new Float32Array(CHORDS.length);
    const aggregateChroma = new Float64Array(12);
    let aggregateWeight = 0;
    let displayedChord = NO_CHORD_ID;
    let candidateChord = NO_CHORD_ID;
    let candidateTicks = 0;
    let historyLocal: LiveChordEvent[] = [];
    const startedAt = performance.now();

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);

      let sumSquares = 0;
      for (let i = 0; i < FRAME_SIZE; i++) sumSquares += buffer[i] * buffer[i];
      const rms = Math.sqrt(sumSquares / FRAME_SIZE);

      const silent = rms < LEVEL_GATE;
      let chroma: Float32Array = new Float32Array(12);
      if (!silent) {
        const { frames } = computeChromagram(buffer, context.sampleRate, {
          frameSize: FRAME_SIZE,
          hopSize: FRAME_SIZE,
        });
        if (frames.length > 0) chroma = frames[0].chroma;
      }

      const scores = scoreFrame(silent ? new Float32Array(12) : chroma);
      for (let c = 0; c < scores.length; c++) {
        smoothedScores[c] =
          SCORE_SMOOTHING * smoothedScores[c] + (1 - SCORE_SMOOTHING) * scores[c];
      }

      let best = 0;
      for (let c = 1; c < smoothedScores.length; c++) {
        if (smoothedScores[c] > smoothedScores[best]) best = c;
      }

      // Hysteresis: a new chord must win SWITCH_TICKS ticks in a row.
      if (best === displayedChord) {
        candidateTicks = 0;
      } else if (best === candidateChord) {
        candidateTicks++;
        if (candidateTicks >= SWITCH_TICKS) {
          displayedChord = best;
          candidateTicks = 0;
          const elapsed = (performance.now() - startedAt) / 1000;
          if (displayedChord !== NO_CHORD_ID) {
            historyLocal = [
              ...historyLocal.slice(-(MAX_HISTORY - 1)),
              {
                chordId: displayedChord,
                name: chordNameById(displayedChord),
                startedAt: elapsed,
              },
            ];
          }
        }
      } else {
        candidateChord = best;
        candidateTicks = 1;
      }

      if (!silent) {
        for (let i = 0; i < 12; i++) aggregateChroma[i] += chroma[i] * rms;
        aggregateWeight += rms;
      }
      const keyEstimate =
        aggregateWeight > 0.15 ? detectKey(aggregateChroma) : null;

      const preferFlats = keyEstimate?.preferFlats ?? false;
      setState({
        status: "listening",
        chordId: displayedChord,
        chordName: chordNameById(displayedChord, preferFlats),
        confidence: smoothedScores[displayedChord],
        chroma,
        level: Math.min(1, rms * 12),
        keyEstimate,
        history: historyLocal.map((h) => ({
          ...h,
          name: chordNameById(h.chordId, preferFlats),
        })),
      });
    }, TICK_MS);

    sessionRef.current = { stream, context, timer };
  }, []);

  return { state, start, stop };
}

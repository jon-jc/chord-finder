"use client";

/**
 * Hook that owns the decode -> worker-analysis pipeline for an audio file.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAudioFile } from "../lib/audio/decode";
import type { AnalysisResult } from "../lib/analysis/types";
import type {
  AnalysisRequest,
  AnalysisResponse,
} from "../workers/analysis.worker";

export type AnalyzerPhase = "idle" | "decoding" | "analyzing" | "done" | "error";

export interface AnalyzerState {
  phase: AnalyzerPhase;
  /** 0..1 across decode + analysis. */
  progress: number;
  result: AnalysisResult | null;
  error: string | null;
  /** Object URL for playback of the original file. */
  audioUrl: string | null;
  fileName: string | null;
  /** Mono 22.05kHz PCM of the decoded file (for waveform rendering). */
  pcm: Float32Array | null;
}

const INITIAL: AnalyzerState = {
  phase: "idle",
  progress: 0,
  result: null,
  error: null,
  audioUrl: null,
  fileName: null,
  pcm: null,
};

export function useAnalyzer() {
  const [state, setState] = useState<AnalyzerState>(INITIAL);
  const workerRef = useRef<Worker | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const jobRef = useRef(0);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const analyze = useCallback(async (file: File) => {
    const job = ++jobRef.current;

    workerRef.current?.terminate();
    workerRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);

    const audioUrl = URL.createObjectURL(file);
    audioUrlRef.current = audioUrl;

    setState({
      ...INITIAL,
      phase: "decoding",
      progress: 0.02,
      audioUrl,
      fileName: file.name,
    });

    let decoded;
    try {
      decoded = await decodeAudioFile(file);
    } catch {
      if (jobRef.current !== job) return;
      setState((s) => ({
        ...s,
        phase: "error",
        error:
          "Could not decode this file. Try a common format like MP3, WAV, OGG, or M4A.",
      }));
      return;
    }
    if (jobRef.current !== job) return;

    const pcmForWave = decoded.mono.slice();
    setState((s) => ({ ...s, phase: "analyzing", progress: 0.15, pcm: pcmForWave }));

    const worker = new Worker(
      new URL("../workers/analysis.worker.ts", import.meta.url)
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      if (jobRef.current !== job) return;
      const message = event.data;
      if (message.type === "progress") {
        setState((s) => ({ ...s, progress: 0.15 + 0.85 * message.fraction }));
      } else if (message.type === "result") {
        setState((s) => ({
          ...s,
          phase: "done",
          progress: 1,
          result: message.result,
        }));
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      } else {
        setState((s) => ({ ...s, phase: "error", error: message.message }));
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
    };
    worker.onerror = () => {
      if (jobRef.current !== job) return;
      setState((s) => ({
        ...s,
        phase: "error",
        error: "Analysis failed unexpectedly.",
      }));
    };

    const request: AnalysisRequest = {
      type: "analyze",
      pcm: decoded.mono,
      sampleRate: decoded.sampleRate,
    };
    worker.postMessage(request, [decoded.mono.buffer]);
  }, []);

  const reset = useCallback(() => {
    jobRef.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setState(INITIAL);
  }, []);

  return { state, analyze, reset };
}

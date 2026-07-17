/**
 * Web Worker that runs the offline chord/key analysis off the main thread.
 */

import { analyzeAudio } from "../lib/analysis/analyze";
import type { AnalysisResult } from "../lib/analysis/types";

export interface AnalysisRequest {
  type: "analyze";
  pcm: Float32Array;
  sampleRate: number;
}

export type AnalysisResponse =
  | { type: "progress"; fraction: number }
  | { type: "result"; result: AnalysisResult }
  | { type: "error"; message: string };

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { data } = event;
  if (data.type !== "analyze") return;

  const post = (message: AnalysisResponse) => self.postMessage(message);

  try {
    let lastReported = -1;
    const result = analyzeAudio(data.pcm, data.sampleRate, {
      onProgress: (fraction) => {
        const percent = Math.round(fraction * 100);
        if (percent !== lastReported) {
          lastReported = percent;
          post({ type: "progress", fraction });
        }
      },
    });
    post({ type: "result", result });
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

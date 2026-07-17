"use client";

/**
 * Records the audio of a browser tab via getDisplayMedia + MediaRecorder.
 * The user picks which tab to share (and must enable "share tab audio");
 * everything stays local.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CaptureStatus = "idle" | "capturing" | "error";

export interface TabCaptureState {
  status: CaptureStatus;
  /** Seconds recorded so far (updates ~4x/s while capturing). */
  elapsed: number;
  error: string | null;
}

export function isTabCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    "getDisplayMedia" in navigator.mediaDevices &&
    typeof MediaRecorder !== "undefined"
  );
}

export function useTabCapture() {
  const [state, setState] = useState<TabCaptureState>({
    status: "idle",
    elapsed: 0,
    error: null,
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /** Ask the user to share a tab (with audio) and start recording. */
  const start = useCallback(async () => {
    if (!isTabCaptureSupported()) {
      setState({
        status: "error",
        elapsed: 0,
        error:
          "Tab audio capture is not supported in this browser. Chrome or Edge work best.",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
        // Chrome-specific hints: offer the current tab first.
        ...({ preferCurrentTab: true, selfBrowserSurface: "include" } as object),
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setState({
          status: "error",
          elapsed: 0,
          error:
            'No audio was shared. Pick the tab again and enable "Also share tab audio".',
        });
        return;
      }

      // Record audio only; drop the (mandatory) video track from the recording.
      const audioStream = new MediaStream(audioTracks);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : {});

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
            : null;
        stopResolveRef.current?.(blob);
        stopResolveRef.current = null;
        cleanup();
        setState({ status: "idle", elapsed: 0, error: null });
      };

      // If the user ends sharing from the browser UI, finish the recording.
      for (const track of stream.getTracks()) {
        track.onended = () => {
          if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
          }
        };
      }

      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start(250);

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        setState((s) =>
          s.status === "capturing"
            ? { ...s, elapsed: (Date.now() - startedAt) / 1000 }
            : s
        );
      }, 250);

      setState({ status: "capturing", elapsed: 0, error: null });
    } catch (err) {
      const aborted =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "AbortError");
      setState({
        status: "idle",
        elapsed: 0,
        error: aborted ? null : "Could not start capture.",
      });
    }
  }, [cleanup]);

  /** Stop recording; resolves with the recorded audio (null if empty). */
  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      cleanup();
      setState({ status: "idle", elapsed: 0, error: null });
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      stopResolveRef.current = resolve;
      recorder.stop();
    });
  }, [cleanup]);

  return { state, start, stop };
}

"use client";

/**
 * The main file-analysis experience: upload, analyze in a worker, then
 * explore the results with synced playback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnalyzer } from "../hooks/useAnalyzer";
import { FileDrop } from "./FileDrop";
import { Waveform } from "./Waveform";
import { ChordTimeline } from "./ChordTimeline";
import { KeyCard } from "./KeyCard";
import { ChromagramView } from "./ChromagramView";
import { CurrentChord } from "./CurrentChord";
import { formatTime } from "../lib/ui/colors";

export function AnalyzerApp() {
  const { state, analyze, reset } = useAnalyzer();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Coarse (~100ms) time updates for chord highlighting; the waveform
  // playhead animates at 60fps on its own canvas.
  useEffect(() => {
    if (state.phase !== "done") return;
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (audio) setCurrentTime(audio.currentTime);
    }, 100);
    return () => clearInterval(interval);
  }, [state.phase]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, time);
    setCurrentTime(audio.currentTime);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const { result } = state;
  const segments = result?.chords ?? [];
  const activeIndex = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime
  );
  const activeSegment = activeIndex >= 0 ? segments[activeIndex] : null;
  const nextSegment =
    activeIndex >= 0 && activeIndex + 1 < segments.length
      ? segments[activeIndex + 1]
      : null;

  return (
    <div className="w-full">
      {state.phase === "idle" && (
        <div className="flex flex-col gap-3">
          <FileDrop onFile={analyze} />
          <button
            onClick={async () => {
              const response = await fetch("/demo.wav");
              const blob = await response.blob();
              void analyze(new File([blob], "demo-progression.wav", { type: "audio/wav" }));
            }}
            className="self-center rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            No file handy? Try the demo clip →
          </button>
        </div>
      )}

      {(state.phase === "decoding" || state.phase === "analyzing") && (
        <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-slate-900/60 px-8 py-16">
          <p className="text-lg font-medium text-slate-200">
            {state.phase === "decoding" ? "Decoding" : "Listening for chords"}
            <span className="text-slate-500"> · {state.fileName}</span>
          </p>
          <div className="mt-6 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-200"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-sm tabular-nums text-slate-500">
            {Math.round(state.progress * 100)}%
          </p>
        </div>
      )}

      {state.phase === "error" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/20 bg-red-950/30 px-8 py-12">
          <p className="text-red-300">{state.error}</p>
          <button
            onClick={reset}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
          >
            Try another file
          </button>
        </div>
      )}

      {state.phase === "done" && result && state.audioUrl && state.pcm && (
        <div className="flex flex-col gap-4">
          <audio
            ref={audioRef}
            src={state.audioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="truncate text-sm text-slate-400">
              <span className="font-medium text-slate-200">{state.fileName}</span>
            </p>
            <button
              onClick={reset}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/5"
            >
              Analyze another file
            </button>
          </div>

          <KeyCard
            keyEstimate={result.key}
            tuningCents={result.tuningCents}
            duration={result.duration}
            chordCount={segments.filter((s) => s.name !== "N").length}
          />

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex items-center gap-4 lg:flex-col">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-400 hover:shadow-indigo-400/30"
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
                  </svg>
                )}
              </button>
              <p className="text-sm tabular-nums text-slate-500">
                {formatTime(currentTime)} / {formatTime(result.duration)}
              </p>
            </div>

            <div className="min-w-0 flex-1">
              <Waveform
                pcm={state.pcm}
                duration={result.duration}
                segments={segments}
                audioRef={audioRef}
                onSeek={seek}
              />
            </div>

            <CurrentChord segment={activeSegment} nextSegment={nextSegment} />
          </div>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">
              Chord progression
            </h3>
            <ChordTimeline
              segments={segments}
              currentTime={currentTime}
              onSeek={seek}
            />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">
              Pitch-class energy (chromagram)
            </h3>
            <ChromagramView chromagram={result.chromagram} />
          </section>
        </div>
      )}
    </div>
  );
}

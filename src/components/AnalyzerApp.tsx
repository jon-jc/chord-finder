"use client";

/**
 * The main file-analysis experience: upload, analyze in a worker, then
 * explore the results with synced playback. The user chooses which outputs
 * they want (chord chart / guitar tabs / MIDI).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalyzer } from "../hooks/useAnalyzer";
import { layoutTab } from "../lib/tabs/layout";
import { mapToFretboard } from "../lib/tabs/fretboard";
import { buildRhythmColumns } from "../lib/tabs/rhythm";
import { renderAsciiTab } from "../lib/tabs/ascii";
import { buildMidiFile } from "../lib/midi/writer";
import { FileDrop } from "./FileDrop";
import { OutputToggles, useOutputPrefs } from "./OutputToggles";
import { TabSheet } from "./TabSheet";
import { Waveform } from "./Waveform";
import { ChordTimeline } from "./ChordTimeline";
import { KeyCard } from "./KeyCard";
import { ChromagramView } from "./ChromagramView";
import { CurrentChord } from "./CurrentChord";
import { formatTime } from "../lib/ui/colors";

interface AnalyzerAppProps {
  /** Increment to load the bundled demo clip. */
  demoNonce?: number;
  /** Externally captured audio (e.g. YouTube tab capture) to analyze. */
  externalFile?: { file: File; nonce: number } | null;
}

type TabStyle = "auto" | "notes" | "chords";

export function AnalyzerApp({ demoNonce = 0, externalFile = null }: AnalyzerAppProps) {
  const { state, analyze, reset } = useAnalyzer();
  const { prefs, toggle } = useOutputPrefs();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [tabStyle, setTabStyle] = useState<TabStyle>("auto");

  // Each new file starts back on auto style (adjust-during-render).
  const [seenAudioUrl, setSeenAudioUrl] = useState(state.audioUrl);
  if (state.audioUrl !== seenAudioUrl) {
    setSeenAudioUrl(state.audioUrl);
    setTabStyle("auto");
  }

  const loadDemo = useCallback(async () => {
    const response = await fetch("demo.wav"); // relative: works under a base path
    const blob = await response.blob();
    void analyze(new File([blob], "demo-progression.wav", { type: "audio/wav" }));
  }, [analyze]);

  useEffect(() => {
    if (demoNonce > 0) void loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoNonce]);

  useEffect(() => {
    if (externalFile) void analyze(externalFile.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFile?.nonce]);

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

  // Auto style: note-for-note for clean solo recordings, chord voicings
  // for dense mixes (where mixture transcription cannot match the part).
  const effectiveStyle: Exclude<TabStyle, "auto"> = useMemo(() => {
    if (tabStyle !== "auto") return tabStyle;
    return result?.arrangement.mode === "dense" ? "chords" : "notes";
  }, [tabStyle, result]);

  const tabLayout = useMemo(() => {
    if (!result || !prefs.tabs) return null;
    const columns =
      effectiveStyle === "chords"
        ? buildRhythmColumns(
            result.chords,
            result.transcription.onsets,
            result.transcription.tempoBpm
          )
        : mapToFretboard(result.transcription.notes, result.chords);
    if (columns.length === 0) return null;
    return layoutTab(
      columns,
      result.chords,
      result.transcription.tempoBpm,
      result.duration
    );
  }, [result, prefs.tabs, effectiveStyle]);

  const download = useCallback((data: BlobPart, mime: string, name: string) => {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const baseName = (state.fileName ?? "chordlab").replace(/\.[^.]+$/, "");

  const downloadAsciiTab = useCallback(() => {
    if (!tabLayout) return;
    const text = renderAsciiTab(tabLayout, state.fileName ?? "Transcription");
    download(text, "text/plain", `${baseName}-tab.txt`);
  }, [tabLayout, state.fileName, baseName, download]);

  const downloadMidi = useCallback(() => {
    if (!result) return;
    const bytes = buildMidiFile(result, { title: baseName });
    download(bytes.buffer as ArrayBuffer, "audio/midi", `${baseName}.mid`);
  }, [result, baseName, download]);

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
        <div className="flex flex-col gap-5">
          <FileDrop onFile={analyze} />
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">
                What do you want out of it?
              </p>
              <OutputToggles prefs={prefs} onToggle={toggle} />
            </div>
            <button
              onClick={() => void loadDemo()}
              className="self-center rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              No file handy? Try the demo clip →
            </button>
          </div>
        </div>
      )}

      {(state.phase === "decoding" || state.phase === "analyzing") && (
        <div className="animate-fade-up flex flex-col items-center rounded-2xl border border-white/5 bg-slate-900/60 px-8 py-16">
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

          <div
            className="animate-fade-up flex flex-wrap items-center justify-between gap-3"
            style={{ animationDelay: "0ms" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <p className="truncate text-sm font-medium text-slate-200">
                {state.fileName}
              </p>
              <OutputToggles prefs={prefs} onToggle={toggle} compact />
            </div>
            <div className="flex gap-2">
              {prefs.midi && (
                <button
                  onClick={downloadMidi}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-all hover:-translate-y-0.5 hover:bg-emerald-500/25"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 3v13" />
                    <path d="m7 12 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                  Download MIDI
                </button>
              )}
              <button
                onClick={reset}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/5"
              >
                Analyze another file
              </button>
            </div>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
            <KeyCard
              keyEstimate={result.key}
              keyTimeline={result.keyTimeline}
              tuningCents={result.tuningCents}
              duration={result.duration}
              chordCount={segments.filter((s) => s.name !== "N").length}
            />
          </div>

          <div
            className="animate-fade-up flex flex-col gap-4 lg:flex-row"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex items-center gap-4 lg:flex-col">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-105 hover:bg-indigo-400 hover:shadow-indigo-400/30"
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

          {prefs.chords && (
            <section className="animate-fade-up" style={{ animationDelay: "180ms" }}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">
                Chord progression
              </h3>
              <ChordTimeline
                segments={segments}
                currentTime={currentTime}
                onSeek={seek}
                keyEstimate={result.key}
              />
            </section>
          )}

          {prefs.tabs && tabLayout && (
            <section className="animate-fade-up" style={{ animationDelay: "240ms" }}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-medium uppercase tracking-widest text-slate-500">
                  Guitar tab{" "}
                  <span className="normal-case tracking-normal text-slate-600">
                    · ~{Math.round(tabLayout.tempoBpm)} BPM ·{" "}
                    {effectiveStyle === "chords"
                      ? "chord voicings"
                      : `${result.transcription.notes.length} notes`}{" "}
                    · standard tuning
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="Tab style"
                    className="flex rounded-lg border border-white/10 p-0.5 text-xs"
                  >
                    {(
                      [
                        ["chords", "Chord voicings"],
                        ["notes", "Note-for-note"],
                      ] as const
                    ).map(([style, label]) => (
                      <button
                        key={style}
                        aria-pressed={effectiveStyle === style}
                        onClick={() => setTabStyle(style)}
                        title={
                          tabStyle === "auto"
                            ? `Auto-selected ${
                                effectiveStyle === "chords"
                                  ? "chord voicings (dense mix detected)"
                                  : "note-for-note (clean recording detected)"
                              }`
                            : undefined
                        }
                        className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                          effectiveStyle === style
                            ? "bg-indigo-500/25 text-indigo-200"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {tabStyle === "auto" && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                      auto
                    </span>
                  )}
                  <button
                    onClick={downloadAsciiTab}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
                  >
                    Download .txt tab
                  </button>
                </div>
              </div>
              <TabSheet
                layout={tabLayout}
                currentTime={currentTime}
                onSeek={seek}
              />
            </section>
          )}

          {!prefs.chords && !prefs.tabs && !prefs.midi && (
            <p className="rounded-xl border border-white/5 bg-slate-900/40 px-5 py-4 text-sm text-slate-500">
              All outputs are switched off — turn on a chip above to see the
              chord chart, guitar tab, or MIDI export.
            </p>
          )}

          <section className="animate-fade-up" style={{ animationDelay: "300ms" }}>
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

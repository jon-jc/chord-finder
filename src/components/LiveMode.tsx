"use client";

/** Live microphone chord recognition view. */

import { useLiveChords } from "../hooks/useLiveChords";
import { NO_CHORD_ID } from "../lib/theory/chords";
import { chordColor, pitchClassColor } from "../lib/ui/colors";
import { ChromaBars } from "./ChromaBars";

export function LiveMode() {
  const { state, start, stop } = useLiveChords();
  const listening = state.status === "listening";
  const isNoChord = state.chordId === NO_CHORD_ID;

  return (
    <div className="flex flex-col gap-4">
      {state.status === "denied" && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-5 py-4 text-sm text-amber-200">
          Microphone access was blocked. Allow the microphone for this site in
          your browser settings, then try again.
        </div>
      )}
      {state.status === "error" && (
        <div className="rounded-xl border border-red-500/20 bg-red-950/30 px-5 py-4 text-sm text-red-300">
          Could not open the microphone. Is another app using it?
        </div>
      )}

      <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-slate-900/60 px-8 py-10">
        {!listening ? (
          <>
            <button
              onClick={() => void start()}
              disabled={state.status === "starting"}
              className="flex items-center gap-3 rounded-full bg-rose-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-rose-500/25 transition-all hover:bg-rose-400 disabled:opacity-60"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
                <path d="M12 18v4" />
              </svg>
              {state.status === "starting" ? "Starting…" : "Start listening"}
            </button>
            <p className="mt-4 max-w-md text-center text-sm text-slate-500">
              Play your instrument near the microphone. Chords, key, and
              pitch-class energy update in real time — nothing is recorded or
              uploaded.
            </p>
          </>
        ) : (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-rose-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
              </span>
              Listening
            </div>

            <p
              className="text-8xl font-bold tracking-tight transition-colors duration-150"
              style={{ color: isNoChord ? "#334155" : chordColor(state.chordId) }}
            >
              {isNoChord ? "—" : state.chordName}
            </p>

            <div className="h-1.5 w-56 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-400/80 transition-all duration-150"
                style={{ width: `${Math.round(state.level * 100)}%` }}
              />
            </div>

            <div className="w-full max-w-xl">
              <ChromaBars chroma={state.chroma} />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              <p className="text-sm text-slate-400">
                Key so far:{" "}
                {state.keyEstimate ? (
                  <span
                    className="font-semibold"
                    style={{ color: pitchClassColor(state.keyEstimate.tonic) }}
                  >
                    {state.keyEstimate.name}
                  </span>
                ) : (
                  <span className="text-slate-600">listening…</span>
                )}
              </p>
            </div>

            <button
              onClick={stop}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {state.history.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">
            Heard so far
          </h3>
          <div className="flex flex-wrap gap-2">
            {state.history.map((event, i) => (
              <span
                key={`${event.startedAt}-${i}`}
                className="rounded-lg border border-white/5 bg-slate-900/60 px-3 py-1.5 text-sm font-semibold"
                style={{ color: chordColor(event.chordId) }}
              >
                {event.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

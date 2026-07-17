"use client";

import type { KeyEstimate, KeySpan } from "../lib/theory/key";
import { formatTime, pitchClassColor } from "../lib/ui/colors";

interface KeyCardProps {
  keyEstimate: KeyEstimate;
  keyTimeline?: KeySpan[];
  tuningCents: number;
  duration: number;
  chordCount: number;
}

export function KeyCard({
  keyEstimate,
  keyTimeline,
  tuningCents,
  duration,
  chordCount,
}: KeyCardProps) {
  const modulates = (keyTimeline?.length ?? 0) > 1;
  const confidencePct = Math.max(
    0,
    Math.min(100, Math.round(keyEstimate.confidence * 400))
  );

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-white/5 bg-slate-900/60 px-6 py-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Detected key
        </p>
        <p
          className="mt-1 text-4xl font-bold tracking-tight"
          style={{ color: pitchClassColor(keyEstimate.tonic) }}
        >
          {keyEstimate.name}
        </p>
        {modulates && keyTimeline && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
            <span className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 font-medium text-fuchsia-300">
              modulates
            </span>
            {keyTimeline.map((span, i) => (
              <span key={span.startTime}>
                {i > 0 && <span className="text-slate-600"> → </span>}
                <span style={{ color: pitchClassColor(span.tonic) }}>
                  {span.name}
                </span>
                <span className="text-slate-600"> @{formatTime(span.startTime)}</span>
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="min-w-36">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Certainty
        </p>
        <div className="mt-2 h-2 w-36 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          vs. {keyEstimate.alternatives[1]?.name ?? "—"}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Tuning
        </p>
        <p className="mt-1 text-lg font-semibold text-slate-200">
          A4 = {(440 * Math.pow(2, tuningCents / 1200)).toFixed(1)} Hz
          <span className="ml-2 text-sm font-normal text-slate-500">
            ({tuningCents >= 0 ? "+" : ""}
            {tuningCents.toFixed(0)}¢)
          </span>
        </p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Chords
        </p>
        <p className="mt-1 text-lg font-semibold text-slate-200">
          {chordCount}
          <span className="ml-2 text-sm font-normal text-slate-500">
            in {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}
          </span>
        </p>
      </div>
    </div>
  );
}

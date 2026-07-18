"use client";

/**
 * The primary result view: a bar-by-bar chord chart with the song's main
 * progression called out, synced to playback.
 */

import type { ChordChart as ChartModel } from "../lib/chart";
import { chordColor } from "../lib/ui/colors";

interface ChordChartProps {
  chart: ChartModel;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function ChordChart({ chart, currentTime, onSeek }: ChordChartProps) {
  const { measures, mainProgression } = chart;
  if (measures.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {mainProgression && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-widest text-indigo-300">
            Main progression
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            {mainProgression.names.map((name, i) => (
              <span key={`${name}-${i}`} className="flex items-baseline gap-2">
                {i > 0 && <span className="text-slate-600">–</span>}
                <span
                  className="text-lg font-bold"
                  style={{ color: chordColor(mainProgression.chordIds[i]) }}
                >
                  {name}
                </span>
                <span className="text-xs text-slate-500">
                  {mainProgression.numerals[i]}
                </span>
              </span>
            ))}
          </span>
          <span className="ml-auto rounded bg-white/5 px-2 py-0.5 text-xs tabular-nums text-slate-400">
            ×{mainProgression.repeats} · {(mainProgression.coverage * 100).toFixed(0)}% of song
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8">
        {measures.map((measure) => {
          const isActive =
            currentTime >= measure.startTime && currentTime < measure.endTime;
          return (
            <button
              key={measure.index}
              onClick={() => onSeek(measure.startTime + 0.01)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 py-2 transition-all ${
                isActive
                  ? "scale-[1.03] border-white/40 bg-white/10 shadow-lg"
                  : "border-white/5 bg-slate-900/50 hover:border-white/20"
              }`}
              title={`Bar ${measure.index + 1}`}
            >
              {measure.entries.length === 0 ? (
                <span className="text-sm text-slate-700">·</span>
              ) : (
                <span className="flex flex-wrap items-baseline justify-center gap-x-1.5">
                  {measure.entries.map((entry, i) => (
                    <span key={`${entry.chordId}-${i}`} className="flex items-baseline gap-1">
                      {i > 0 && <span className="text-xs text-slate-600">·</span>}
                      <span
                        className="text-sm font-bold"
                        style={{ color: chordColor(entry.chordId) }}
                      >
                        {entry.name}
                      </span>
                      <span className="text-[10px] text-slate-500">{entry.numeral}</span>
                    </span>
                  ))}
                </span>
              )}
              <span className="mt-0.5 text-[9px] tabular-nums text-slate-600">
                {measure.index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

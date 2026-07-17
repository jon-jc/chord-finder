"use client";

import type { ChordSegment } from "../lib/analysis/types";
import { chordColor } from "../lib/ui/colors";

interface CurrentChordProps {
  segment: ChordSegment | null;
  nextSegment: ChordSegment | null;
}

export function CurrentChord({ segment, nextSegment }: CurrentChordProps) {
  const isNoChord = !segment || segment.name === "N";
  return (
    <div className="flex min-w-44 flex-col items-center justify-center rounded-2xl border border-white/5 bg-slate-900/60 px-8 py-6">
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
        Now playing
      </p>
      <p
        className="mt-1 text-6xl font-bold tabular-nums tracking-tight transition-colors duration-200"
        style={{ color: isNoChord ? "#475569" : chordColor(segment.chordId) }}
      >
        {isNoChord ? "—" : segment.name}
      </p>
      <p className="mt-2 h-5 text-sm text-slate-500">
        {nextSegment && nextSegment.name !== "N" ? (
          <>
            next:{" "}
            <span style={{ color: chordColor(nextSegment.chordId, 0.85) }}>
              {nextSegment.name}
            </span>
          </>
        ) : (
          " "
        )}
      </p>
    </div>
  );
}

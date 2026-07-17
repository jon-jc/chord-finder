"use client";

import { useEffect, useRef } from "react";
import type { ChordSegment } from "../lib/analysis/types";
import { chordColor, formatTime } from "../lib/ui/colors";

interface ChordTimelineProps {
  segments: ChordSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export function ChordTimeline({ segments, currentTime, onSeek }: ChordTimelineProps) {
  const activeIndex = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime
  );
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeIndex]);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {segments.map((seg, i) => {
        const isActive = i === activeIndex;
        const isNoChord = seg.name === "N";
        return (
          <button
            key={`${seg.startTime}-${i}`}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSeek(seg.startTime + 0.01)}
            title={`${formatTime(seg.startTime)} – ${formatTime(seg.endTime)} · confidence ${(seg.confidence * 100).toFixed(0)}%`}
            className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-2 transition-all ${
              isActive
                ? "scale-105 border-white/40 bg-white/10 shadow-lg"
                : "border-white/5 bg-slate-900/60 hover:border-white/20"
            }`}
          >
            <span
              className="text-base font-semibold"
              style={{ color: isNoChord ? "#64748b" : chordColor(seg.chordId) }}
            >
              {isNoChord ? "·" : seg.name}
            </span>
            <span className="mt-0.5 text-[10px] tabular-nums text-slate-500">
              {formatTime(seg.startTime)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

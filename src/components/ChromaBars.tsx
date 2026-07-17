"use client";

/** Live 12-bar pitch-class visualizer. */

import { PITCH_CLASSES } from "../lib/theory/notes";
import { pitchClassColor } from "../lib/ui/colors";

interface ChromaBarsProps {
  chroma: Float32Array;
  height?: number;
}

export function ChromaBars({ chroma, height = 120 }: ChromaBarsProps) {
  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height }}>
      {Array.from({ length: 12 }, (_, pc) => {
        const value = Math.min(1, chroma[pc] * 1.15);
        return (
          <div key={pc} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t-md transition-[height] duration-100"
              style={{
                height: `${Math.round(value * (height - 22))}px`,
                background: pitchClassColor(pc, 0.35 + 0.65 * value),
                minHeight: 2,
              }}
            />
            <span className="text-[10px] font-medium text-slate-500">
              {PITCH_CLASSES[pc]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

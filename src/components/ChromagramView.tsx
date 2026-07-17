"use client";

/** Heatmap of pitch-class energy over time. */

import { useCallback, useEffect, useRef } from "react";
import { PITCH_CLASSES } from "../lib/theory/notes";
import { pitchClassColor } from "../lib/ui/colors";

interface ChromagramViewProps {
  chromagram: Float32Array[];
  height?: number;
}

export function ChromagramView({ chromagram, height = 168 }: ChromagramViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || chromagram.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const labelWidth = 28;
    const plotWidth = width - labelWidth;
    const rowHeight = height / 12;
    const colWidth = Math.max(1, plotWidth / chromagram.length);

    for (let t = 0; t < chromagram.length; t++) {
      const frame = chromagram[t];
      const x = labelWidth + (t / chromagram.length) * plotWidth;
      for (let pc = 0; pc < 12; pc++) {
        const value = frame[pc];
        if (value <= 0.02) continue;
        // Row 0 at the top = B, descending to C at the bottom.
        const y = (11 - pc) * rowHeight;
        ctx.fillStyle = pitchClassColor(pc, Math.min(1, value * 1.2));
        ctx.fillRect(x, y + 0.5, colWidth + 0.5, rowHeight - 1);
      }
    }

    ctx.font = "10px ui-monospace, monospace";
    ctx.textBaseline = "middle";
    for (let pc = 0; pc < 12; pc++) {
      const y = (11 - pc) * rowHeight + rowHeight / 2;
      ctx.fillStyle = "rgba(148,163,184,0.9)";
      ctx.fillText(PITCH_CLASSES[pc], 4, y);
    }
  }, [chromagram, height]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-xl bg-slate-950/60"
      style={{ height }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

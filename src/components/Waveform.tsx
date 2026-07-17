"use client";

/**
 * Canvas waveform with chord-colored segments and a smooth playhead.
 * The playhead is drawn on a separate overlay canvas from a rAF loop that
 * reads the audio element's currentTime directly, so playback stays at 60fps
 * without React re-renders.
 */

import { useCallback, useEffect, useRef } from "react";
import type { ChordSegment } from "../lib/analysis/types";
import { chordColor } from "../lib/ui/colors";

interface WaveformProps {
  pcm: Float32Array;
  duration: number;
  segments: ChordSegment[];
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onSeek: (time: number) => void;
  height?: number;
}

export function Waveform({
  pcm,
  duration,
  segments,
  audioRef,
  onSeek,
  height = 128,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const drawBase = useCallback(() => {
    const canvas = baseRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Chord segment backgrounds.
    for (const seg of segments) {
      const x0 = (seg.startTime / duration) * width;
      const x1 = (seg.endTime / duration) * width;
      ctx.fillStyle = chordColor(seg.chordId, 0.16);
      ctx.fillRect(x0, 0, x1 - x0, height);
    }

    // Min/max waveform.
    const mid = height / 2;
    const samplesPerPixel = pcm.length / width;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const start = Math.floor(x * samplesPerPixel);
      const end = Math.min(pcm.length, Math.ceil((x + 1) * samplesPerPixel));
      let min = 0;
      let max = 0;
      for (let i = start; i < end; i++) {
        const v = pcm[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x + 0.5, mid - max * (mid - 4));
      ctx.lineTo(x + 0.5, mid - min * (mid - 4));
    }
    ctx.strokeStyle = "rgba(165, 180, 252, 0.75)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Segment boundaries.
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    for (const seg of segments) {
      const x = (seg.startTime / duration) * width;
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    ctx.stroke();
  }, [pcm, segments, duration, height]);

  useEffect(() => {
    drawBase();
    const observer = new ResizeObserver(drawBase);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [drawBase]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const canvas = overlayRef.current;
      const container = containerRef.current;
      const audio = audioRef.current;
      if (canvas && container && audio) {
        const dpr = window.devicePixelRatio || 1;
        const width = container.clientWidth;
        if (canvas.width !== width * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, width, height);
          const x = (audio.currentTime / duration) * width;
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fillRect(x - 0.75, 0, 1.5, height);
          ctx.beginPath();
          ctx.arc(x, 6, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioRef, duration, height]);

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-crosshair overflow-hidden rounded-xl bg-slate-950/60"
      style={{ height }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const fraction = (e.clientX - rect.left) / rect.width;
        onSeek(fraction * duration);
      }}
    >
      <canvas ref={baseRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
}

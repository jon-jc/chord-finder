"use client";

/**
 * Animated landing hero: aurora background, cycling chord preview card,
 * and CTAs that jump straight into the studio.
 */

import { useEffect, useState } from "react";
import { pitchClassColor } from "../lib/ui/colors";

interface HeroProps {
  onStart: () => void;
  onDemo: () => void;
}

const PREVIEW_CHORDS = [
  { name: "C", numeral: "I", pc: 0 },
  { name: "G", numeral: "V", pc: 7 },
  { name: "Am", numeral: "vi", pc: 9 },
  { name: "F", numeral: "IV", pc: 5 },
];

const FEATURES = [
  {
    label: "Chords & key",
    icon: (
      <path d="M9 18V5l12-2v13M9 9l12-2M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    ),
  },
  {
    label: "Guitar tabs",
    icon: <path d="M3 7h18M3 10.5h18M3 14h18M3 17.5h18M8 5v15M16 4v15" />,
  },
  {
    label: "MIDI export",
    icon: <path d="M12 3v13m0 0-5-5m5 5 5-5M5 21h14" />,
  },
  {
    label: "Live microphone",
    icon: (
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 1 1-6 0V5a3 3 0 0 1 3-3ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3" />
    ),
  },
  {
    label: "YouTube links",
    icon: (
      <path d="M2.5 12c0-3.3 0-4.9.9-6a4 4 0 0 1 1.6-1.2C6.3 4.3 8 4.3 12 4.3s5.7 0 7 .5a4 4 0 0 1 1.6 1.2c.9 1.1.9 2.7.9 6s0 4.9-.9 6a4 4 0 0 1-1.6 1.2c-1.3.5-3 .5-7 .5s-5.7 0-7-.5a4 4 0 0 1-1.6-1.2c-.9-1.1-.9-2.7-.9-6ZM10 9l5 3-5 3V9Z" />
    ),
  },
];

// Deterministic pseudo-random bar timing so SSR and client markup match.
const EQ_BARS = Array.from({ length: 12 }, (_, i) => ({
  pc: i,
  duration: 0.9 + ((i * 7) % 5) * 0.14,
  delay: ((i * 11) % 8) * 0.09,
  rest: 0.35 + ((i * 5) % 4) * 0.12,
}));

export function Hero({ onStart, onDemo }: HeroProps) {
  const [chordIndex, setChordIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setChordIndex((i) => (i + 1) % PREVIEW_CHORDS.length),
      2000
    );
    return () => clearInterval(timer);
  }, []);

  const chord = PREVIEW_CHORDS[chordIndex];

  return (
    <section className="relative overflow-hidden">
      {/* Aurora background */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div
          className="aurora-blob left-[-10%] top-[-20%] h-[420px] w-[420px]"
          style={{ background: "rgba(99,102,241,0.28)" }}
        />
        <div
          className="aurora-blob aurora-blob-alt right-[-5%] top-[10%] h-[380px] w-[380px]"
          style={{ background: "rgba(217,70,239,0.18)" }}
        />
        <div
          className="aurora-blob left-[35%] bottom-[-30%] h-[360px] w-[360px]"
          style={{ background: "rgba(16,185,129,0.12)", animationDelay: "-9s" }}
        />
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:pb-24 lg:pt-20">
        {/* Copy */}
        <div>
          <div
            className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur"
            style={{ animationDelay: "0ms" }}
          >
            <span className="animate-glow inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            100% client-side — your audio never leaves the device
          </div>

          <h1
            className="animate-fade-up mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Every chord.
            <br />
            Every key.{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-emerald-300 bg-clip-text text-transparent">
              Instantly.
            </span>
          </h1>

          <p
            className="animate-fade-up mt-5 max-w-xl text-lg text-slate-400"
            style={{ animationDelay: "160ms" }}
          >
            Drop in any song — or just play — and a custom DSP engine maps out
            the chords, finds the key, writes the guitar tab, and hands you a
            MIDI file. Pick exactly the outputs you want.
          </p>

          <div
            className="animate-fade-up mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <button
              onClick={onStart}
              className="group rounded-xl bg-indigo-500 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 hover:bg-indigo-400 hover:shadow-xl hover:shadow-indigo-400/30"
            >
              Analyze your track
              <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">
                →
              </span>
            </button>
            <button
              onClick={onDemo}
              className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-base font-medium text-slate-200 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
            >
              Hear the demo
            </button>
          </div>

          <div
            className="animate-fade-up mt-10 flex flex-wrap gap-2.5"
            style={{ animationDelay: "320ms" }}
          >
            {FEATURES.map((feature) => (
              <span
                key={feature.label}
                className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-indigo-300"
                  aria-hidden
                >
                  {feature.icon}
                </svg>
                {feature.label}
              </span>
            ))}
          </div>
        </div>

        {/* Live preview card */}
        <div
          className="animate-fade-up relative hidden lg:block"
          style={{ animationDelay: "200ms" }}
        >
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-indigo-950/50 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-slate-500">
                <span className="animate-glow inline-block h-2 w-2 rounded-full bg-rose-500" />
                Analyzing
              </div>
              <span className="rounded-md bg-white/5 px-2 py-1 text-xs tabular-nums text-slate-400">
                Key: C major
              </span>
            </div>

            <div className="mt-6 flex items-end justify-center gap-1.5" style={{ height: 110 }}>
              {EQ_BARS.map((bar) => (
                <div
                  key={bar.pc}
                  className="eq-bar w-full flex-1 rounded-t"
                  style={{
                    height: "100%",
                    background: pitchClassColor(bar.pc, 0.8),
                    animationDuration: `${bar.duration}s`,
                    animationDelay: `${bar.delay}s`,
                    transform: `scaleY(${bar.rest})`,
                  }}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-center gap-4">
              <div key={chord.name} className="animate-fade-up flex items-baseline gap-3">
                <span
                  className="text-6xl font-bold tracking-tight"
                  style={{ color: pitchClassColor(chord.pc) }}
                >
                  {chord.name}
                </span>
                <span className="text-xl font-semibold text-slate-500">
                  {chord.numeral}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-2">
              {PREVIEW_CHORDS.map((c, i) => (
                <span
                  key={c.name}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i === chordIndex ? "w-8 bg-indigo-400" : "w-3 bg-slate-700"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Floating chips */}
          <div className="aurora-blob-alt absolute -right-4 -top-5 rounded-xl border border-white/10 bg-slate-900/90 px-3.5 py-2 text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur" style={{ filter: "none", animationDuration: "12s" }}>
            .mid ready
          </div>
          <div className="aurora-blob absolute -bottom-5 -left-4 rounded-xl border border-white/10 bg-slate-900/90 px-3.5 py-2 font-mono text-xs text-slate-300 shadow-xl backdrop-blur" style={{ filter: "none", animationDuration: "15s" }}>
            e|--0--1--0--3--
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

/** Connects the hero CTAs to the studio below it. */

import { useCallback, useState } from "react";
import { Hero } from "./Hero";
import { Studio } from "./Studio";

const STEPS = [
  {
    title: "Drop a track, paste a link, or just play",
    body: "Audio files, YouTube links (captured right in the tab), or live microphone input. Nothing is uploaded anywhere.",
  },
  {
    title: "The engine listens",
    body: "A hand-built DSP pipeline extracts chords, key, tempo, and every note — with tuning correction for imperfect recordings.",
  },
  {
    title: "Take it with you",
    body: "Interactive chord chart, playable guitar tab, plain-text export, and a multi-track MIDI file. You choose the outputs.",
  },
];

export function HomeClient() {
  const [demoNonce, setDemoNonce] = useState(0);

  const scrollToStudio = useCallback(() => {
    document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const startDemo = useCallback(() => {
    setDemoNonce((n) => n + 1);
    scrollToStudio();
  }, [scrollToStudio]);

  return (
    <>
      <Hero onStart={scrollToStudio} onDemo={startDemo} />

      <section
        id="studio"
        className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 pb-16 sm:px-6"
      >
        <Studio demoNonce={demoNonce} />
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-white/5 bg-slate-900/40 p-6 transition-all hover:-translate-y-1 hover:border-indigo-400/20 hover:bg-slate-900/70"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-sm font-bold text-indigo-300">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

"use client";

/** Mode switcher: file analysis, YouTube capture, or live microphone. */

import { useState } from "react";
import { AnalyzerApp } from "./AnalyzerApp";
import { LiveMode } from "./LiveMode";
import { YouTubeMode } from "./YouTubeMode";

type Mode = "file" | "youtube" | "live";

const TABS: { id: Mode; label: string }[] = [
  { id: "file", label: "Analyze a file" },
  { id: "youtube", label: "YouTube link" },
  { id: "live", label: "Live microphone" },
];

interface StudioProps {
  /** Increment to load the bundled demo clip in the file analyzer. */
  demoNonce?: number;
}

export function Studio({ demoNonce = 0 }: StudioProps) {
  const [mode, setMode] = useState<Mode>("file");
  const [captured, setCaptured] = useState<{ file: File; nonce: number } | null>(
    null
  );

  // A new demo request always lands on the file tab (adjust-during-render).
  const [seenNonce, setSeenNonce] = useState(demoNonce);
  if (demoNonce !== seenNonce) {
    setSeenNonce(demoNonce);
    setMode("file");
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Input mode"
        className="flex w-fit gap-1 rounded-xl border border-white/5 bg-slate-900/60 p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => setMode(tab.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              mode === tab.id
                ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Keep the file analyzer mounted so switching tabs doesn't lose results. */}
      <div className={mode === "file" ? "" : "hidden"}>
        <AnalyzerApp demoNonce={demoNonce} externalFile={captured} />
      </div>
      {mode === "youtube" && (
        <YouTubeMode
          onCaptured={(file) => {
            setCaptured((prev) => ({ file, nonce: (prev?.nonce ?? 0) + 1 }));
            setMode("file");
          }}
        />
      )}
      {mode === "live" && <LiveMode />}
    </div>
  );
}

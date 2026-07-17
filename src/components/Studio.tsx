"use client";

/** Mode switcher between file analysis and live microphone input. */

import { useState } from "react";
import { AnalyzerApp } from "./AnalyzerApp";
import { LiveMode } from "./LiveMode";

type Mode = "file" | "live";

const TABS: { id: Mode; label: string }[] = [
  { id: "file", label: "Analyze a file" },
  { id: "live", label: "Live microphone" },
];

export function Studio() {
  const [mode, setMode] = useState<Mode>("file");

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
        <AnalyzerApp />
      </div>
      {mode === "live" && <LiveMode />}
    </div>
  );
}

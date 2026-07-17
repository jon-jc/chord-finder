"use client";

/**
 * Lets the user pick which outputs they care about: chord chart, guitar
 * tabs, and/or MIDI. Persisted across visits.
 */

import { useSyncExternalStore } from "react";

export interface OutputPrefs {
  chords: boolean;
  tabs: boolean;
  midi: boolean;
}

export const DEFAULT_PREFS: OutputPrefs = { chords: true, tabs: true, midi: true };
const STORAGE_KEY = "chordlab-outputs";

// localStorage-backed external store (SSR-safe, syncs across tabs).
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedPrefs: OutputPrefs = DEFAULT_PREFS;

function getSnapshot(): OutputPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage may be unavailable
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedPrefs = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
    } catch {
      cachedPrefs = DEFAULT_PREFS;
    }
  }
  return cachedPrefs;
}

function getServerSnapshot(): OutputPrefs {
  return DEFAULT_PREFS;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function togglePref(key: keyof OutputPrefs): void {
  const next = { ...getSnapshot(), [key]: !getSnapshot()[key] };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    cachedRaw = "__memory__";
    cachedPrefs = next;
  }
  listeners.forEach((listener) => listener());
}

export function useOutputPrefs() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { prefs, toggle: togglePref };
}

const OPTIONS: {
  key: keyof OutputPrefs;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "chords",
    label: "Chord chart",
    hint: "progression + Roman numerals",
    icon: (
      <path d="M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    ),
  },
  {
    key: "tabs",
    label: "Guitar tabs",
    hint: "playable fingerings",
    icon: <path d="M3 7h18M3 10.5h18M3 14h18M3 17.5h18M8 5v15M16 4v15" />,
  },
  {
    key: "midi",
    label: "MIDI file",
    hint: "notes + chords tracks",
    icon: <path d="M12 3v13m0 0-5-5m5 5 5-5M5 21h14" />,
  },
];

interface OutputTogglesProps {
  prefs: OutputPrefs;
  onToggle: (key: keyof OutputPrefs) => void;
  compact?: boolean;
}

export function OutputToggles({ prefs, onToggle, compact = false }: OutputTogglesProps) {
  return (
    <div
      role="group"
      aria-label="Outputs to generate"
      className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2.5"}`}
    >
      {OPTIONS.map((option) => {
        const active = prefs[option.key];
        return (
          <button
            key={option.key}
            aria-pressed={active}
            onClick={() => onToggle(option.key)}
            className={`group flex items-center gap-2.5 rounded-xl border text-left transition-all ${
              compact ? "px-3 py-1.5" : "px-4 py-2.5"
            } ${
              active
                ? "border-indigo-400/40 bg-indigo-500/15 text-white shadow-md shadow-indigo-500/10"
                : "border-white/10 bg-slate-900/50 text-slate-500 hover:border-white/20 hover:text-slate-300"
            }`}
          >
            <svg
              width={compact ? 14 : 17}
              height={compact ? 14 : 17}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={active ? "text-indigo-300" : ""}
              aria-hidden
            >
              {option.icon}
            </svg>
            <span>
              <span className={`block font-medium ${compact ? "text-xs" : "text-sm"}`}>
                {option.label}
              </span>
              {!compact && (
                <span className="block text-xs text-slate-500">{option.hint}</span>
              )}
            </span>
            <span
              aria-hidden
              className={`ml-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] transition-all ${
                active ? "bg-indigo-400 text-slate-950" : "bg-slate-800 text-transparent"
              }`}
            >
              ✓
            </span>
          </button>
        );
      })}
    </div>
  );
}

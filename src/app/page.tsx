import { AnalyzerApp } from "../components/AnalyzerApp";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/20">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              ChordLab
            </h1>
            <p className="text-xs text-slate-500">
              Chords · Key · Tabs · MIDI — entirely in your browser
            </p>
          </div>
        </div>
      </header>

      <section className="mb-10 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Hear the music.{" "}
          <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
            See the chords.
          </span>
        </h2>
        <p className="mt-3 text-slate-400">
          Drop in any song and ChordLab detects every chord, finds the key,
          and lays it all out on an interactive timeline. Nothing is uploaded —
          the analysis runs locally with a custom DSP engine.
        </p>
      </section>

      <AnalyzerApp />

      <footer className="mt-16 border-t border-white/5 pt-6 text-center text-xs text-slate-600">
        Audio never leaves your device.
      </footer>
    </main>
  );
}

import { HomeClient } from "../components/HomeClient";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#070a14]/70 backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/20">
              <svg
                width="18"
                height="18"
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
            <span className="text-lg font-bold tracking-tight text-white">
              ChordLab
            </span>
          </div>
          <a
            href="#studio"
            className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10"
          >
            Open the studio
          </a>
        </div>
      </header>

      <main className="flex-1">
        <HomeClient />
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-600">
        ChordLab — chords, key, tabs, and MIDI, entirely in your browser.
        Audio never leaves your device.
      </footer>
    </div>
  );
}

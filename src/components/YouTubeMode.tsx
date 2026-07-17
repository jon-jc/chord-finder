"use client";

/**
 * YouTube analysis mode: embed the video, capture this tab's audio while it
 * plays (getDisplayMedia), then hand the recording to the analyzer.
 * Nothing is downloaded or uploaded — the audio is recorded locally from
 * the tab, so the same flow works for any streaming site.
 */

import { useState } from "react";
import { isTabCaptureSupported, useTabCapture } from "../hooks/useTabCapture";
import { embedUrl, parseYouTubeId } from "../lib/youtube";
import { formatTime } from "../lib/ui/colors";

interface YouTubeModeProps {
  /** Called with the captured recording, ready for analysis. */
  onCaptured: (file: File) => void;
}

export function YouTubeMode({ onCaptured }: YouTubeModeProps) {
  const [input, setInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [parseError, setParseError] = useState(false);
  const { state, start, stop } = useTabCapture();
  const capturing = state.status === "capturing";
  const supported = isTabCaptureSupported();

  const load = () => {
    const id = parseYouTubeId(input);
    setVideoId(id);
    setParseError(id === null && input.trim().length > 0);
  };

  const finish = async () => {
    const blob = await stop();
    if (!blob || blob.size < 20_000) return; // <~0.5s of opus: nothing useful
    const name = `youtube-${videoId ?? "capture"}.webm`;
    onCaptured(new File([blob], name, { type: blob.type }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
          placeholder="Paste a YouTube link — youtube.com/watch?v=… or youtu.be/…"
          aria-label="YouTube URL"
          className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-400/60 focus:outline-none"
        />
        <button
          onClick={load}
          className="rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
        >
          Load video
        </button>
      </div>

      {parseError && (
        <p className="text-sm text-amber-300">
          That doesn&apos;t look like a YouTube link. Try the full watch URL or a
          youtu.be short link.
        </p>
      )}

      {!supported && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-5 py-4 text-sm text-amber-200">
          This browser can&apos;t capture tab audio. Use Chrome or Edge on desktop
          for YouTube analysis.
        </div>
      )}

      {videoId && (
        <>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            <iframe
              src={embedUrl(videoId)}
              title="YouTube player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full"
            />
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-slate-900/60 px-6 py-5">
            {!capturing ? (
              <>
                <ol className="grid gap-2 text-sm text-slate-400 sm:grid-cols-3">
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
                      1
                    </span>
                    Click capture, pick <b className="text-slate-200">this tab</b>, and
                    enable <b className="text-slate-200">“Also share tab audio”</b>.
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
                      2
                    </span>
                    Press play on the video and let the part you care about run.
                  </li>
                  <li className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
                      3
                    </span>
                    Stop the capture — analysis starts immediately.
                  </li>
                </ol>
                <button
                  onClick={() => void start()}
                  disabled={!supported}
                  className="self-start rounded-xl bg-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition-all hover:bg-rose-400 disabled:opacity-50"
                >
                  ● Start tab capture
                </button>
                {state.error && <p className="text-sm text-red-300">{state.error}</p>}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-5">
                <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-rose-400">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                  </span>
                  Recording tab audio
                </span>
                <span className="text-2xl font-bold tabular-nums text-white">
                  {formatTime(state.elapsed)}
                </span>
                <button
                  onClick={() => void finish()}
                  className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  Stop &amp; analyze
                </button>
                <p className="w-full text-xs text-slate-500">
                  Play the video now. The recording stays on your device.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {!videoId && (
        <p className="text-sm text-slate-500">
          Works with watch links, Shorts, youtu.be, and YouTube Music. The
          same capture also records any other tab — Spotify Web, SoundCloud,
          Bandcamp — if you pick that tab instead.
        </p>
      )}
    </div>
  );
}

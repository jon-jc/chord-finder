"use client";

import { useCallback, useRef, useState } from "react";

interface FileDropProps {
  onFile: (file: File) => void;
  compact?: boolean;
}

export function FileDrop({ onFile, compact = false }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload an audio file"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${
        dragging
          ? "border-indigo-400 bg-indigo-500/10"
          : "border-slate-700 bg-slate-900/40 hover:border-indigo-500/60 hover:bg-slate-900/70"
      } ${compact ? "px-6 py-4" : "px-8 py-16"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.webm"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {!compact && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300 transition-transform group-hover:scale-110">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      )}
      <p className={`font-medium text-slate-200 ${compact ? "text-sm" : "text-lg"}`}>
        {dragging ? "Drop it!" : "Drop an audio file or click to browse"}
      </p>
      <p className="mt-1 text-sm text-slate-500">MP3, WAV, OGG, M4A, FLAC…</p>
    </div>
  );
}

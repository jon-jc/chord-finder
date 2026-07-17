# ChordLab

Analyze any song — or live audio from your microphone — entirely in the browser:

- **Chord recognition** across 145 chord states (12 qualities × 12 roots + no-chord), smoothed with a Viterbi decoder so the timeline reads like a chart, not noise
- **Key detection** via Krumhansl-Schmuckler profile correlation, with certainty and correct flat/sharp spelling
- **Guitar tablature** generated from a full note-level transcription, with chord names above the staff, playable fingerings, and a downloadable plain-text tab
- **MIDI export** (format 1): a transcription track plus a block-chord track, with tempo, time signature, and key signature metadata
- **Live mode**: point a mic at your instrument and watch chords, key, and pitch-class energy update in real time
- **Roman-numeral analysis** of the progression relative to the detected key

No servers, no uploads — a custom TypeScript DSP engine does everything client-side in a Web Worker.

## How it works

**Chromagram.** Audio is decoded and resampled to 22.05 kHz, then analyzed in Hann-windowed 8192-sample frames. Spectral peaks are refined with parabolic interpolation, a global tuning offset is estimated from the circular mean of cent deviations (so detuned recordings still resolve), and peaks map onto a 12-bin pitch-class profile with square-root magnitude compression.

**Chords.** Each frame is scored against harmonic-aware chord templates (instrument overtones are modeled in the template, keeping the chroma itself sharp). A Viterbi pass with sharpened emissions removes flicker while still catching quick changes; segments shorter than 300 ms are absorbed.

**Key.** The energy-weighted aggregate chroma is correlated with the 24 rotated major/minor Krumhansl-Kessler profiles.

**Transcription.** Onsets come from spectral flux with an adaptive threshold and a global significance gate; tempo from autocorrelation of the flux envelope. Each inter-onset segment goes through iterative harmonic-salience pitch estimation with spectral subtraction (up to six simultaneous notes, sub-octave ghost suppression).

**Tabs.** Notes are grouped into columns (strums chain-group automatically) and assigned string/fret positions by exhaustive search minimizing hand position, stretch, and movement. Measures follow the estimated tempo; the chord analysis labels the staff.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and drop in an MP3/WAV/OGG/M4A/FLAC — or click the demo clip.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Run the DSP/theory test suite |
| `npm run lint` | Lint |
| `node scripts/make-demo.mjs` | Regenerate the bundled demo clip |

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Web Audio API · Web Workers · Vitest

All signal processing (FFT, chromagram, onset detection, pitch estimation, Viterbi, MIDI writer) is implemented from scratch in `src/lib` with zero runtime dependencies.

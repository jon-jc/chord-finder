/**
 * Generates public/demo.wav — a short synthesized I-V-vi-IV progression in C
 * used by the "try the demo" button and for manual testing.
 *
 * Run: node scripts/make-demo.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22050;
const CHORD_SECONDS = 1.6;

const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// C, G, Am, F, C, F, G7, C  (roots in octave 3, MIDI C3 = 48)
const PROGRESSION = [
  [48, 52, 55, 60], // C
  [43, 47, 50, 55], // G
  [45, 48, 52, 57], // Am
  [41, 45, 48, 53], // F
  [48, 52, 55, 60], // C
  [41, 45, 48, 53], // F
  [43, 47, 50, 53], // G7
  [48, 52, 55, 60], // C
];

const totalSamples = Math.floor(PROGRESSION.length * CHORD_SECONDS * SAMPLE_RATE);
const pcm = new Float32Array(totalSamples);

PROGRESSION.forEach((notes, chordIndex) => {
  const start = Math.floor(chordIndex * CHORD_SECONDS * SAMPLE_RATE);
  const length = Math.floor(CHORD_SECONDS * SAMPLE_RATE);
  notes.forEach((midi, noteIndex) => {
    const f0 = midiToFreq(midi);
    // Light strum: stagger note onsets by 30ms.
    const onset = Math.floor(noteIndex * 0.03 * SAMPLE_RATE);
    for (let h = 1; h <= 5; h++) {
      const freq = f0 * h;
      if (freq > SAMPLE_RATE / 2) break;
      const amp = 0.22 / (notes.length * h);
      const phase = Math.random() * 2 * Math.PI;
      for (let i = onset; i < length; i++) {
        const t = i - onset;
        const env =
          Math.min(1, t / (0.01 * SAMPLE_RATE)) * Math.exp((-1.1 * t) / SAMPLE_RATE);
        pcm[start + i] +=
          amp * env * Math.sin((2 * Math.PI * freq * t) / SAMPLE_RATE + phase);
      }
    }
  });
});

// Encode 16-bit mono WAV.
const dataSize = pcm.length * 2;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);
for (let i = 0; i < pcm.length; i++) {
  const clamped = Math.max(-1, Math.min(1, pcm[i]));
  buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "demo.wav");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);

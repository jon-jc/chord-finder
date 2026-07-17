/** Window functions for spectral analysis. */

const hannCache = new Map<number, Float32Array>();

export function hannWindow(size: number): Float32Array {
  const cached = hannCache.get(size);
  if (cached) return cached;
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  hannCache.set(size, window);
  return window;
}

/** Multiply `frame` by the Hann window into `out` (frame is untouched). */
export function applyHann(frame: Float32Array, out: Float32Array): void {
  const window = hannWindow(frame.length);
  for (let i = 0; i < frame.length; i++) {
    out[i] = frame[i] * window[i];
  }
}

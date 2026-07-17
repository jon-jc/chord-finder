/**
 * Iterative radix-2 Cooley-Tukey FFT with cached twiddle factors and
 * bit-reversal tables. Sizes must be powers of two.
 */

interface FftPlan {
  size: number;
  cosTable: Float32Array;
  sinTable: Float32Array;
  reverseTable: Uint32Array;
}

const planCache = new Map<number, FftPlan>();

function getPlan(size: number): FftPlan {
  const cached = planCache.get(size);
  if (cached) return cached;

  if (size <= 0 || (size & (size - 1)) !== 0) {
    throw new Error(`FFT size must be a power of two, got ${size}`);
  }

  const cosTable = new Float32Array(size / 2);
  const sinTable = new Float32Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    const angle = (-2 * Math.PI * i) / size;
    cosTable[i] = Math.cos(angle);
    sinTable[i] = Math.sin(angle);
  }

  const reverseTable = new Uint32Array(size);
  const bits = Math.log2(size);
  for (let i = 0; i < size; i++) {
    let reversed = 0;
    for (let b = 0; b < bits; b++) {
      reversed = (reversed << 1) | ((i >> b) & 1);
    }
    reverseTable[i] = reversed;
  }

  const plan: FftPlan = { size, cosTable, sinTable, reverseTable };
  planCache.set(size, plan);
  return plan;
}

/**
 * In-place complex FFT. `real` and `imag` must both have length `size`.
 */
export function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const size = real.length;
  const { cosTable, sinTable, reverseTable } = getPlan(size);

  for (let i = 0; i < size; i++) {
    const j = reverseTable[i];
    if (j > i) {
      let tmp = real[i];
      real[i] = real[j];
      real[j] = tmp;
      tmp = imag[i];
      imag[i] = imag[j];
      imag[j] = tmp;
    }
  }

  for (let blockSize = 2; blockSize <= size; blockSize <<= 1) {
    const half = blockSize >> 1;
    const step = size / blockSize;
    for (let blockStart = 0; blockStart < size; blockStart += blockSize) {
      for (let k = 0, twiddle = 0; k < half; k++, twiddle += step) {
        const evenIdx = blockStart + k;
        const oddIdx = evenIdx + half;
        const wr = cosTable[twiddle];
        const wi = sinTable[twiddle];
        const or_ = real[oddIdx];
        const oi = imag[oddIdx];
        const tr = or_ * wr - oi * wi;
        const ti = or_ * wi + oi * wr;
        real[oddIdx] = real[evenIdx] - tr;
        imag[oddIdx] = imag[evenIdx] - ti;
        real[evenIdx] += tr;
        imag[evenIdx] += ti;
      }
    }
  }
}

/**
 * Magnitude spectrum of a real signal. Returns `size / 2 + 1` bins.
 * The input is copied, not mutated.
 */
export function magnitudeSpectrum(signal: Float32Array): Float32Array {
  const size = signal.length;
  const real = new Float32Array(signal);
  const imag = new Float32Array(size);
  fftInPlace(real, imag);
  const bins = size / 2 + 1;
  const magnitudes = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    magnitudes[i] = Math.hypot(real[i], imag[i]);
  }
  return magnitudes;
}

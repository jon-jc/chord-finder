import { describe, expect, it } from "vitest";
import { fftInPlace, magnitudeSpectrum } from "../dsp/fft";

describe("fft", () => {
  it("matches a naive DFT on random input", () => {
    const size = 256;
    const real = new Float32Array(size);
    const imag = new Float32Array(size);
    for (let i = 0; i < size; i++) real[i] = Math.sin(i * 0.7) + Math.cos(i * 1.3);

    const expectedReal = new Float64Array(size);
    const expectedImag = new Float64Array(size);
    for (let k = 0; k < size; k++) {
      for (let n = 0; n < size; n++) {
        const angle = (-2 * Math.PI * k * n) / size;
        expectedReal[k] += real[n] * Math.cos(angle);
        expectedImag[k] += real[n] * Math.sin(angle);
      }
    }

    fftInPlace(real, imag);
    for (let k = 0; k < size; k++) {
      expect(real[k]).toBeCloseTo(expectedReal[k], 2);
      expect(imag[k]).toBeCloseTo(expectedImag[k], 2);
    }
  });

  it("localizes a pure tone in the right bin", () => {
    const size = 4096;
    const sampleRate = 22050;
    const freq = 440;
    const signal = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      signal[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }
    const spectrum = magnitudeSpectrum(signal);
    let peakBin = 0;
    for (let i = 1; i < spectrum.length; i++) {
      if (spectrum[i] > spectrum[peakBin]) peakBin = i;
    }
    const peakFreq = (peakBin * sampleRate) / size;
    expect(Math.abs(peakFreq - freq)).toBeLessThan(sampleRate / size);
  });

  it("rejects non-power-of-two sizes", () => {
    expect(() => fftInPlace(new Float32Array(100), new Float32Array(100))).toThrow();
  });
});

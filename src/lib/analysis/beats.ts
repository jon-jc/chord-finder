/**
 * Beat grid estimation: given detected onsets and a tempo, find the phase
 * offset that best aligns a beat grid with the onsets (circular mean).
 * Used to quantize chord timing for MIDI export and chart bars.
 */

export interface BeatGrid {
  beatSeconds: number;
  /** Grid offset in [0, beatSeconds): beats fall at phase + k * beatSeconds. */
  phase: number;
}

export function estimateBeatGrid(onsets: number[], tempoBpm: number): BeatGrid {
  const beatSeconds = tempoBpm > 0 ? 60 / tempoBpm : 0.6;
  if (onsets.length === 0) return { beatSeconds, phase: 0 };

  let sumSin = 0;
  let sumCos = 0;
  for (const t of onsets) {
    const angle = (2 * Math.PI * t) / beatSeconds;
    sumSin += Math.sin(angle);
    sumCos += Math.cos(angle);
  }
  if (sumSin === 0 && sumCos === 0) return { beatSeconds, phase: 0 };
  const meanAngle = Math.atan2(sumSin, sumCos);
  const phase = ((meanAngle / (2 * Math.PI)) * beatSeconds + beatSeconds) % beatSeconds;
  return { beatSeconds, phase };
}

/**
 * Snap a time to the nearest grid subdivision, but only when it is already
 * close (within `tolerance` fraction of the subdivision) — genuinely
 * off-grid events stay where they are.
 */
export function snapToGrid(
  time: number,
  grid: BeatGrid,
  subdivision = 2,
  tolerance = 0.35
): number {
  const step = grid.beatSeconds / subdivision;
  const offset = time - grid.phase;
  const nearest = Math.round(offset / step) * step + grid.phase;
  if (Math.abs(nearest - time) <= step * tolerance) return Math.max(0, nearest);
  return time;
}

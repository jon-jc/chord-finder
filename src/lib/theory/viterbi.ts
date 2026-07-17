/**
 * Viterbi smoothing over per-frame chord scores.
 *
 * A simple HMM: every chord is a state, emissions are the normalized
 * template scores, and transitions strongly favor staying on the current
 * chord. This removes the frame-to-frame flicker that raw template matching
 * produces, without smearing genuine chord changes.
 */

export interface ViterbiOptions {
  /** Probability of remaining in the same state between frames. */
  selfTransition?: number;
  /**
   * Exponent applied to emission scores (inverse softmax temperature).
   * Raw template scores are cosine similarities that only differ by a few
   * percent between candidates; sharpening them lets genuine chord changes
   * overcome the transition penalty within a few frames.
   */
  emissionPower?: number;
}

/**
 * @param frameScores per-frame array of non-negative state scores
 * @returns the most likely state index per frame
 */
export function viterbiDecode(
  frameScores: Float32Array[],
  options: ViterbiOptions = {}
): Int32Array {
  const frameCount = frameScores.length;
  if (frameCount === 0) return new Int32Array(0);
  const stateCount = frameScores[0].length;
  const selfTransition = options.selfTransition ?? 0.85;
  const emissionPower = options.emissionPower ?? 10;

  const logSelf = Math.log(selfTransition);
  const logSwitch = Math.log((1 - selfTransition) / (stateCount - 1));

  const backPointers = new Int32Array(frameCount * stateCount);
  let previous = new Float64Array(stateCount);
  let current = new Float64Array(stateCount);

  const emission = (frame: Float32Array, state: number): number =>
    emissionPower * Math.log(frame[state] + 1e-6);

  for (let s = 0; s < stateCount; s++) {
    previous[s] = emission(frameScores[0], s);
  }

  for (let t = 1; t < frameCount; t++) {
    // With a uniform switch probability, the best predecessor is either the
    // same state (self transition) or the globally best previous state
    // (switch), so each frame is O(states) instead of O(states^2).
    let bestPrevState = 0;
    let bestPrevScore = -Infinity;
    for (let s = 0; s < stateCount; s++) {
      if (previous[s] > bestPrevScore) {
        bestPrevScore = previous[s];
        bestPrevState = s;
      }
    }

    for (let s = 0; s < stateCount; s++) {
      const stayScore = previous[s] + logSelf;
      const switchScore = bestPrevScore + logSwitch;
      // If the best previous state IS s, switching "from best" is really a
      // stay; fall back to comparing against the runner-up is unnecessary
      // because stayScore >= that switchScore in that case.
      if (stayScore >= switchScore || bestPrevState === s) {
        current[s] = stayScore + emission(frameScores[t], s);
        backPointers[t * stateCount + s] = s;
      } else {
        current[s] = switchScore + emission(frameScores[t], s);
        backPointers[t * stateCount + s] = bestPrevState;
      }
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  let bestState = 0;
  let bestScore = -Infinity;
  for (let s = 0; s < stateCount; s++) {
    if (previous[s] > bestScore) {
      bestScore = previous[s];
      bestState = s;
    }
  }

  const path = new Int32Array(frameCount);
  path[frameCount - 1] = bestState;
  for (let t = frameCount - 1; t > 0; t--) {
    path[t - 1] = backPointers[t * stateCount + path[t]];
  }
  return path;
}

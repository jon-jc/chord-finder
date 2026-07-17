/**
 * Browser-side audio decoding: any format the browser can play (mp3, wav,
 * ogg, m4a, flac...) -> mono Float32Array at the analysis sample rate.
 */

export const ANALYSIS_SAMPLE_RATE = 22050;

export interface DecodedAudio {
  /** Mono PCM at ANALYSIS_SAMPLE_RATE, for analysis. */
  mono: Float32Array;
  sampleRate: number;
  duration: number;
}

export async function decodeAudioFile(
  file: Blob,
  targetRate = ANALYSIS_SAMPLE_RATE
): Promise<DecodedAudio> {
  const arrayBuffer = await file.arrayBuffer();

  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const decodeCtx = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    void decodeCtx.close();
  }

  // Downmix + resample in one offline render.
  const length = Math.ceil(decoded.duration * targetRate);
  const offline = new OfflineAudioContext(1, length, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return {
    mono: rendered.getChannelData(0).slice(),
    sampleRate: targetRate,
    duration: decoded.duration,
  };
}

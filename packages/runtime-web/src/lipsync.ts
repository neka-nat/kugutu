/**
 * Audio-driven lip-sync: derives the mouth-open amount from audio loudness
 * (RMS) instead of viseme timestamps, for TTS engines that return only audio.
 *
 * Two layers share one envelope model:
 * - `attachAudioLipSync` — realtime. Taps an `<audio>`/`<video>` element (or a
 *   caller-wired `AnalyserNode`) and drives `player.setMouthOpen()` every
 *   animation frame while the audio plays.
 * - `mouthCurveFromAudioBuffer` / `mouthCurveFromSamples` — offline and fully
 *   deterministic. Precomputes one open value per video frame from decoded
 *   audio, for frame-stepped (e.g. MP4 screenshot) rendering pipelines.
 */

import type { CharacterPlayer } from "./index.js";

type MouthDriver = Pick<CharacterPlayer, "setMouthOpen">;

export interface LipSyncEnvelopeOptions {
  /** RMS at or below this level is treated as silence. Default 0.01. */
  gate?: number;
  /**
   * Multiplier from gated RMS to mouth-open. Default 8 for realtime; the
   * offline curve auto-calibrates from the clip's loudness when omitted.
   */
  gain?: number;
  /** Smoothing time constant while the mouth is opening. Default 50ms. */
  attackMs?: number;
  /** Smoothing time constant while the mouth is closing. Default 130ms. */
  releaseMs?: number;
}

interface EnvelopeParams {
  gate: number;
  gain: number;
  attackMs: number;
  releaseMs: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolveEnvelope(
  options: LipSyncEnvelopeOptions,
  fallbackGain: number
): EnvelopeParams {
  return {
    gate: options.gate ?? 0.01,
    gain: options.gain ?? fallbackGain,
    attackMs: options.attackMs ?? 50,
    releaseMs: options.releaseMs ?? 130,
  };
}

// The soft exponent lifts quiet-but-voiced passages so normal speech reads as
// clear mouth motion rather than a barely-open flutter.
function rmsToTarget(rms: number, params: EnvelopeParams): number {
  const raw = clamp01((rms - params.gate) * params.gain);
  return raw <= 0 ? 0 : Math.pow(raw, 0.7);
}

function smooth(
  current: number,
  target: number,
  deltaMs: number,
  params: EnvelopeParams
): number {
  const tau = target > current ? params.attackMs : params.releaseMs;
  const alpha = deltaMs <= 0 ? 0 : 1 - Math.exp(-deltaMs / Math.max(1, tau));
  return current + (target - current) * alpha;
}

function frameRms(samples: Float32Array, start: number, end: number): number {
  const from = Math.max(0, start);
  const to = Math.min(samples.length, end);
  if (to <= from) {
    return 0;
  }
  let sum = 0;
  for (let index = from; index < to; index += 1) {
    const sample = samples[index]!;
    sum += sample * sample;
  }
  return Math.sqrt(sum / (to - from));
}

export interface MouthCurveOptions extends LipSyncEnvelopeOptions {
  /** Output frames per second — one open value per frame. Default 30. */
  fps?: number;
}

/**
 * Offline, deterministic mouth-open curve from raw mono samples: one value in
 * [0, 1] per output frame. Same input + options ⇒ same output, always, which
 * makes it the right lip-sync source for frame-stepped MP4 rendering:
 *
 * ```ts
 * const curve = mouthCurveFromAudioBuffer(decoded, { fps: 30 });
 * for (const open of curve) {
 *   player.setMouthOpen(open);
 *   player.step(1000 / 30);
 *   await screenshot();
 * }
 * ```
 *
 * When `gain` is omitted the curve auto-calibrates: the clip's 95th-percentile
 * frame loudness maps to a fully open mouth, so quiet and loud TTS voices
 * both animate with full range.
 */
export function mouthCurveFromSamples(
  samples: Float32Array,
  sampleRate: number,
  options: MouthCurveOptions = {}
): number[] {
  const fps = options.fps ?? 30;
  if (samples.length === 0 || sampleRate <= 0 || fps <= 0) {
    return [];
  }

  const samplesPerFrame = sampleRate / fps;
  const frameCount = Math.ceil(samples.length / samplesPerFrame);
  const rmsValues: number[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    rmsValues.push(
      frameRms(
        samples,
        Math.floor(frame * samplesPerFrame),
        Math.floor((frame + 1) * samplesPerFrame)
      )
    );
  }

  const gate = options.gate ?? 0.01;
  let gain = options.gain;
  if (gain === undefined) {
    const voiced = rmsValues.filter((value) => value > gate).sort((a, b) => a - b);
    const reference = voiced[Math.floor(voiced.length * 0.95)];
    gain = reference && reference > gate ? 1 / (reference - gate) : 8;
  }
  const params: EnvelopeParams = {
    gate,
    gain,
    attackMs: options.attackMs ?? 50,
    releaseMs: options.releaseMs ?? 130,
  };

  const frameMs = 1000 / fps;
  const curve: number[] = [];
  let open = 0;
  for (const rms of rmsValues) {
    open = smooth(open, rmsToTarget(rms, params), frameMs, params);
    curve.push(open);
  }
  return curve;
}

/**
 * Convenience wrapper over {@link mouthCurveFromSamples}: mixes the decoded
 * `AudioBuffer` down to mono and returns one open value per frame.
 */
export function mouthCurveFromAudioBuffer(
  buffer: AudioBuffer,
  options: MouthCurveOptions = {}
): number[] {
  const channels = buffer.numberOfChannels;
  if (channels === 0 || buffer.length === 0) {
    return [];
  }

  let mono = buffer.getChannelData(0);
  if (channels > 1) {
    const mixed = new Float32Array(buffer.length);
    mixed.set(mono);
    for (let channel = 1; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < mixed.length; index += 1) {
        mixed[index]! += data[index]!;
      }
    }
    for (let index = 0; index < mixed.length; index += 1) {
      mixed[index]! /= channels;
    }
    mono = mixed;
  }

  return mouthCurveFromSamples(mono, buffer.sampleRate, options);
}

export interface AudioLipSyncOptions extends LipSyncEnvelopeOptions {
  /**
   * AudioContext used to tap a media element. Ignored when the element was
   * already tapped before (a media element can only ever be routed into one
   * context) or when an `AnalyserNode` is passed directly.
   */
  audioContext?: AudioContext;
  /** Analyser window size in samples (power of two). Default 1024. */
  fftSize?: number;
}

export interface AudioLipSyncHandle {
  /** The analyser feeding the mouth — reusable for visualization. */
  analyser: AnalyserNode;
  /** Stops driving the mouth and closes it. Audio playback is unaffected. */
  stop(): void;
}

// createMediaElementSource() throws if called twice for the same element, so
// the tap is created once per element and reused across attach/stop cycles.
const mediaElementSources = new WeakMap<
  HTMLMediaElement,
  MediaElementAudioSourceNode
>();

/**
 * Realtime audio-driven lip-sync: measures the loudness of `audio` every
 * animation frame and drives `player.setMouthOpen()` so the mouth follows the
 * voice. No timing data needed — ideal for TTS engines that return only an
 * audio blob (e.g. Gemini TTS):
 *
 * ```ts
 * const audio = new Audio(ttsUrl);
 * const lipSync = attachAudioLipSync(player, audio);
 * await audio.play();
 * // … later
 * lipSync.stop();
 * ```
 *
 * Notes for media elements: tapping routes the element through Web Audio (a
 * one-way, per-element operation — playback keeps working, including after
 * `stop()`); cross-origin sources need `crossOrigin="anonymous"` and CORS
 * headers, or the analyser reads silence; browsers keep the AudioContext
 * suspended until a user gesture — attaching from a click handler, or calling
 * `audio.play()` from one, resumes it automatically.
 *
 * Pass an `AnalyserNode` instead to keep full control of the audio graph
 * (e.g. WebRTC streams, custom mixing) — the analyser is then read as-is.
 */
export function attachAudioLipSync(
  player: MouthDriver,
  audio: HTMLMediaElement | AnalyserNode,
  options: AudioLipSyncOptions = {}
): AudioLipSyncHandle {
  const params = resolveEnvelope(options, 8);

  let analyser: AnalyserNode;
  let cleanupMedia: (() => void) | null = null;

  if (typeof AnalyserNode !== "undefined" && audio instanceof AnalyserNode) {
    analyser = audio;
  } else {
    const element = audio as HTMLMediaElement;
    let source = mediaElementSources.get(element);
    if (!source) {
      const context = options.audioContext ?? new AudioContext();
      source = context.createMediaElementSource(element);
      mediaElementSources.set(element, source);
      // Tapping disconnects the element from the default output; reconnect it
      // so the audio stays audible.
      source.connect(context.destination);
    }

    const context = source.context as AudioContext;
    analyser = context.createAnalyser();
    analyser.fftSize = options.fftSize ?? 1024;
    source.connect(analyser);

    const resume = (): void => {
      if (context.state === "suspended") {
        void context.resume().catch(() => {});
      }
    };
    resume();
    element.addEventListener("play", resume);
    const tappedSource = source;
    cleanupMedia = () => {
      element.removeEventListener("play", resume);
      tappedSource.disconnect(analyser);
    };
  }

  const buffer = new Float32Array(analyser.fftSize);
  let open = 0;
  let lastFrameMs: number | null = null;
  let rafId: number | null = null;

  const frame = (timeMs: number): void => {
    const deltaMs = lastFrameMs === null ? 0 : timeMs - lastFrameMs;
    lastFrameMs = timeMs;

    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let index = 0; index < buffer.length; index += 1) {
      const sample = buffer[index]!;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / buffer.length);

    open = smooth(open, rmsToTarget(rms, params), deltaMs, params);
    player.setMouthOpen(open);
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);

  return {
    analyser,
    stop(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      cleanupMedia?.();
      cleanupMedia = null;
      player.setMouthOpen(0);
    },
  };
}

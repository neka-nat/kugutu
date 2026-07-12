# Lip-sync v0 — timing sources, audio-driven mouths, deterministic rendering

The runtime's mouth is driven through two channels: `setMouthOpen(0..1)` (a
single open amount) and `speak(cues)` (timed visemes interpolated against the
bundle's viseme library). This document covers where the *timing* comes from,
including the common case where your TTS engine returns audio but no phoneme
timestamps (e.g. Gemini TTS), and how to render lip-synced frames
deterministically for video export.

## Picking a timing source

| Your situation | Use | Quality |
| --- | --- | --- |
| TTS emits viseme/phoneme events (Azure, Polly, …) | `speak(cues)` directly | best |
| Audio plays in an `<audio>` element, no timestamps | `attachAudioLipSync(player, audio)` | very good — mouth follows the actual voice |
| Rendering frames offline (MP4 export), no timestamps | `mouthCurveFromAudioBuffer(buffer)` + `setMouthOpen` per frame | very good, fully deterministic |
| You have the script text and the audio duration | `visemesFromText(text, { durationMs })` → `speak()` | good — plausible shapes, approximate timing |
| Just need the mouth to move | `speak(cues, { loop: true })` with a canned cue pattern | baseline talking loop |

The sources compose: e.g. lecture-style pipelines can use the offline curve
for video export and the realtime attach for a live preview, from the same
audio file.

## 1. Realtime: `attachAudioLipSync`

Measures audio loudness (RMS) every animation frame via an `AnalyserNode` and
drives `setMouthOpen()` with an attack/release-smoothed envelope. Zero
pipeline changes: point it at the `<audio>` element you already play.

```ts
import { attachAudioLipSync } from "@kugutu/runtime-web";

const audio = new Audio(ttsUrl);
const lipSync = attachAudioLipSync(player, audio);
await audio.play();

// when the utterance (or the session) is over:
lipSync.stop(); // closes the mouth; audio routing/playback is unaffected
```

Options (`AudioLipSyncOptions`): `gate` (silence threshold, default `0.01`),
`gain` (RMS→open multiplier, default `8`), `attackMs`/`releaseMs` (smoothing,
defaults `50`/`130`), `fftSize` (analyser window, default `1024`),
`audioContext` (bring your own).

Notes:

- Tapping a media element routes it through Web Audio **once per element,
  permanently** (the tap is cached and reused across attach/stop cycles);
  playback keeps working normally.
- Cross-origin audio needs `crossOrigin="anonymous"` + CORS headers on the
  audio response, otherwise the analyser reads silence.
- Browsers keep the `AudioContext` suspended until a user gesture. The attach
  listens for `play` on the element and resumes automatically, so calling
  `audio.play()` from a click handler is enough.
- Advanced graphs (WebRTC, mixing, insert effects): pass an `AnalyserNode`
  you wired yourself instead of the media element.

## 2. Offline: `mouthCurveFromAudioBuffer`

For frame-stepped pipelines (screenshot → MP4), realtime analysis is the wrong
tool — it follows the wall clock, not your frame counter. Instead, precompute
one mouth-open value per video frame from the decoded audio. Same input, same
options ⇒ same curve, every run.

```ts
import { mouthCurveFromAudioBuffer } from "@kugutu/runtime-web";

const ctx = new AudioContext();
const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
const fps = 30;
const curve = mouthCurveFromAudioBuffer(decoded, { fps });

player.stop(); // never start() in a frame-stepped pipeline
for (const open of curve) {
  player.setMouthOpen(open);
  player.step(1000 / fps);
  await captureFrame();
}
```

When `gain` is omitted the curve auto-calibrates to the clip (95th-percentile
loudness ⇒ fully open), so quiet and loud voices both use the full range.
`mouthCurveFromSamples(samples, sampleRate, options)` is the lower-level
entry point taking raw mono `Float32Array` samples (usable outside the DOM,
e.g. in Node with your own decoder).

## 3. Text-based: `visemesFromText`

When you have the spoken script and the audio duration but no timestamps,
generate a synthetic cue track. Exported from `@kugutu/schema` and re-exported
by `@kugutu/runtime-web`.

```ts
import { visemesFromText } from "@kugutu/runtime-web";

const durationMs = audio.duration * 1000; // measured from the decoded audio
player.speak(visemesFromText("こんにちは、世界！", { durationMs }));
audio.play();
```

How it maps Japanese (`lang: "ja"`, the default):

- Kana are parsed into morae and spread uniformly across `durationMs`; each
  mora shows its vowel shape (`aa`/`I`/`U`/`E`/`O`).
- ん → `nn`, っ → a brief closure, ー/〜 hold the previous vowel, 拗音
  (きゃ/しゅ/ちょ …) resolve to the small kana's vowel.
- Bilabials (ま/ば/ぱ rows) get a short `PP` lip-close onset; ふ gets `FF`.
- Punctuation becomes a rest (`sil`); sentence enders pause longer than
  commas.
- Characters without a reading (kanji, Latin, digits) degrade to a
  deterministic cycle of vowel shapes (~2 morae per kanji) so the mouth keeps
  moving plausibly. For precise output on kanji-heavy text, pass the kana
  reading (from your TTS input or a tokenizer) instead of the raw script.

The output is deterministic and contiguous, and ends exactly at `durationMs`.

## 4. Baseline: canned talking loop

`speak()` already supports looping, so a sprite-style mouth flap needs no new
API:

```ts
player.speak(
  [
    { viseme: "aa", startMs: 0 },
    { viseme: "I", startMs: 140 },
    { viseme: "O", startMs: 280 },
    { viseme: "sil", startMs: 420, endMs: 520 },
  ],
  { loop: true }
);
// …
player.stopSpeaking();
```

## Browser global build (script tag / CDN)

`@kugutu/runtime-web` ships an IIFE bundle for standalone HTML pages — same
loading style as Rive's CDN build. Everything above is available on the
`Kugutu` global:

```html
<script src="https://unpkg.com/@kugutu/runtime-web/dist/kugutu.global.js"></script>
<script>
  (async () => {
    const player = await Kugutu.load("./mascot.charpack", "#stage");
    const audio = new Audio("./line-001.mp3");
    Kugutu.attachAudioLipSync(player, audio);
    await audio.play();
  })();
</script>
```

The bundle is built by `pnpm --filter @kugutu/runtime-web run build:global`
(or `pnpm run build:runtime-global` from the repo root) into
`dist/kugutu.global.js`; the package's `unpkg`/`jsdelivr` fields point at it.

## Deterministic frame-stepped rendering

The runtime is deterministic by design: **no `Math.random()`, `Date.now()`,
or `performance.now()` anywhere in the animation model.** All idle behaviors
(blink, breathing, arm sway) are pure functions of accumulated `step(deltaMs)`
time. Given the same bundle, the same API-call sequence, and the same
`step()` deltas, every frame reproduces exactly. Recipe:

1. Create the player and **do not call `start()`** (that attaches a
   wall-clock `requestAnimationFrame` loop).
2. Apply state for the frame (`setMouthOpen`, `setEmotion`, `playGesture`, …)
   — these calls re-render immediately but do not advance time.
3. Call `step(1000 / fps)` and capture.

Two intentional caveats:

- Blink intervals default to the midpoint of `[minIntervalMs, maxIntervalMs]`
  (perfectly periodic). For natural jitter in live apps — or seeded,
  reproducible jitter in renders — inject a random source:
  `createCharacterPlayer(bundle, svg, { random: Math.random })` (also
  accepted by `createCharacterPlayerFromPack` and `Kugutu.load`). The default
  keeps determinism; any future randomness in the runtime must go through
  this hook.
- Mouth smoothing (`speak`/lip-sync envelopes) integrates per step, so the
  same content rendered at a different fps produces very slightly different
  in-between values. Keep fps fixed within a render.

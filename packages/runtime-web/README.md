# `@kugutu/runtime-web`

Browser runtime for [Kugutu](https://github.com/neka-nat/kugutu) — animates a
compiled character (`.charpack` or charbundle + SVG) with CSS transforms and
exposes an actor API. No WebGL, no canvas.

```bash
npm install @kugutu/runtime-web
```

## Usage

```ts
import { Kugutu } from "@kugutu/runtime-web";

// Fetch the .charpack, mount it into the target, start it.
const actor = await Kugutu.load("/mascot.charpack", "#stage");

actor.lookAt({ x: 0.2, y: -0.1 });
actor.setEmotion("happy", 0.8);
actor.playGesture("wave");
actor.setMouthOpen(0.4);

// Viseme-based lip-sync (cue timings as a TTS engine would emit them)
actor.speak([
  { viseme: "PP", startMs: 0 },
  { viseme: "aa", startMs: 120 },
  { viseme: "sil", startMs: 240 },
]);

// Mii-style live part editing
actor.setPart("hair.front", "hair-front-bob-01");
actor.tunePart("eye", { scale: 1.1, spacing: 8 });
```

`Kugutu.load(source, target, options?)` accepts a URL or a `CharPack` object,
and a CSS selector or an `HTMLElement`.

No character yet? [`@kugutu/schema`](https://www.npmjs.com/package/@kugutu/schema)
ships a ready-made sample you can load immediately:

```ts
import type { CharPack } from "@kugutu/schema";
import samplePack from "@kugutu/schema/examples/mascot.charpack.json";

const actor = await Kugutu.load(samplePack as CharPack, "#stage");
```

## Player API

- `lookAt({ x, y })` — gaze/head tracking (−1..1)
- `setEmotion(name, intensity)` / `setMouthOpen(value)`
- `playBehavior(id)` — trigger a compiled behavior (e.g. a forced blink)
- `playGesture(id)` / `playGestureForText(text)` — timed keyframe gestures
- `speak(cues, options?)` / `stopSpeaking()` — viseme lip-sync
- `setPart(slot, partId)` / `setVariant(slot, partId)` / `tunePart(slot, transform)` / `getPart(slot)`
- `applyPreset(presetId)` — apply a named preset of part selections
- `start()` / `stop()` / `step(deltaMs)` / `destroy()`

Lower-level entry points: `createCharacterPlayer(bundle, svgRoot)` and
`createCharacterPlayerFromPack(pack, container, options?)`.

Characters are authored as JSON + SVG and compiled with
[`@kugutu/cli`](https://www.npmjs.com/package/@kugutu/cli). See the
[project README](https://github.com/neka-nat/kugutu#readme) for the full
pipeline.

# Kugutu

Programmable 2D characters for apps and AI interfaces.

Studio Demo: https://kugutu-studio.vercel.app/

https://github.com/user-attachments/assets/f4635eea-4198-4834-bb54-b9cec2b97019

Kugutu (傀儡, "puppet") is a code-first alternative to Rive / Spine / Live2D for
developers who want an animated, interactive avatar or mascot in their product.
Characters are authored as plain JSON + SVG, compiled into a single runtime
file, and driven from JavaScript with a small actor API — no animation editor
required, and the whole pipeline is friendly to git diffs and AI agents.

## Highlights

- **Text-first authoring** — a character is a JSON document plus SVG artwork.
  Review it in a PR, generate it from a script, or let an agent edit it.
- **Single-file distribution** — `kugutu pack` produces a `.charpack`: one JSON
  file containing the composed SVG and all compiled animation data.
- **Actor API** — `lookAt`, `setEmotion`, `playGesture`, `speak` (lip-sync),
  plus idle behaviors like blinking and breathing. Ships as lightweight CSS
  transforms on SVG; no WebGL, no canvas.
- **Data-driven expressions & gestures** — emotions and gestures are bundle
  data, not hard-coded runtime logic. Override or extend them per character.
- **Lip-sync via visemes** — feed `speak()` the timed viseme cues a TTS engine
  emits and the mouth follows.
- **Mii-style parts** — swap hair, eyes, outfits and more at runtime
  (`setPart`, `tunePart`), backed by a parts catalog in the source document.
- **React binding** — drop-in `<KugutuCharacterPack>` component.
- **CLI** — create, edit, validate, lint, and build characters from the
  terminal or from CI.

## How it works

```
  character.json + artwork.svg          (authoring format, git-friendly)
        │
        │  @kugutu/cli — validate / lint / build / pack
        ▼
  mascot.charpack                       (single JSON file: SVG + animation data)
        │
        │  @kugutu/runtime-web — Kugutu.load()
        ▼
  animated SVG in your app              (driven via the actor API)
```

## Packages

| Package | Use it for |
| --- | --- |
| [`@kugutu/runtime-web`](./packages/runtime-web) | Embedding and driving characters in the browser |
| [`@kugutu/react`](./packages/react) | React components wrapping the runtime |
| [`@kugutu/cli`](./packages/cli) | Authoring, validating, and building characters |
| [`@kugutu/compiler`](./packages/compiler) | Programmatic compilation (what the CLI wraps) |
| [`@kugutu/schema`](./packages/schema) | Types, validators, JSON Schemas, slot/behavior taxonomies |

## Quick start: embed a character

```bash
npm install @kugutu/runtime-web
```

```ts
import { Kugutu } from "@kugutu/runtime-web";

// One line: fetch the .charpack, mount it into the target, start it.
const actor = await Kugutu.load("/mascot.charpack", "#stage");

actor.lookAt({ x: 0.2, y: -0.1 });
actor.setEmotion("happy", 0.8);
actor.playGesture("wave");
actor.setMouthOpen(0.4);

// Viseme-based lip-sync (cue timings as a TTS engine would emit them)
actor.speak([
  { viseme: "PP", startMs: 0 },
  { viseme: "aa", startMs: 120 },
  { viseme: "O", startMs: 240 },
  { viseme: "sil", startMs: 360 },
]);

// Mii-style live part editing
actor.setPart("hair.front", "hair-front-bob-01");
actor.tunePart("eye", { scale: 1.1, spacing: 8 });
```

`Kugutu.load` also accepts a `CharPack` object instead of a URL, and an
`HTMLElement` instead of a selector. Lower-level entry points
(`createCharacterPlayer(bundle, svgRoot)`,
`createCharacterPlayerFromPack(pack, container)`) remain available.

### Try it with the bundled sample

`@kugutu/schema` ships a ready-made sample character (the demo mascot above),
so the snippet works before you author anything. Either copy it into your
static assets:

```bash
npm install @kugutu/schema
cp node_modules/@kugutu/schema/examples/mascot.charpack.json public/mascot.charpack
```

or import it directly through your bundler:

```ts
import type { CharPack } from "@kugutu/schema";
import samplePack from "@kugutu/schema/examples/mascot.charpack.json";

const actor = await Kugutu.load(samplePack as CharPack, "#stage");
```

### React

```bash
npm install @kugutu/react
```

```tsx
import { KugutuCharacterPack } from "@kugutu/react";

<KugutuCharacterPack
  pack={pack}
  onPlayerReady={(player) => player?.setEmotion("happy", 0.8)}
/>;
```

## Quick start: create a character

```bash
npm install -g @kugutu/cli

kugutu init my-mascot --template avatar-lite --id my-mascot
kugutu import my-mascot/character.json artwork.svg --copy
kugutu add-behavior my-mascot/character.json blink
kugutu add-behavior my-mascot/character.json look-at
kugutu add-behavior my-mascot/character.json breathing
kugutu add-behavior my-mascot/character.json mouth-open
kugutu lint my-mascot/character.json
kugutu pack my-mascot/character.json artwork.svg --out my-mascot.charpack
```

Your SVG needs element ids for the parts you want to animate (eyes, mouth,
head, …); the character document maps **semantic slots** (`eye.l`, `mouth`,
`torso`, …) to those ids, so behaviors stay reusable across characters.
`kugutu lint` tells you what is missing.

## Concepts

- **Semantic slots** — characters bind named slots (e.g. `eye.l`, `mouth`,
  `arm.r`) to SVG node ids instead of coupling animations to layer names.
  Templates (`avatar-lite`, `mascot-upper`, `vtuber-lite`) define which slots a
  character type requires.
- **Behaviors** — reusable idle/reactive motions with typed params: `blink`,
  `look-at`, `breathing`, `mouth-open`, `arm-idle`.
- **Expressions & gestures** — an expression is a static pose scaled by
  intensity (`setEmotion("happy", 0.8)`); a gesture is a timed keyframe
  animation (`playGesture("nod")`). A built-in library (`happy`, `sad`,
  `angry`, `surprised`, `wave`, `nod`, …) is compiled into every bundle and can
  be overridden per character.
- **Lip-sync** — `speak(cues)` interpolates a built-in 15-shape viseme library
  (`sil`, `aa`, `E`, `O`, `PP`, …) with smoothing; `stopSpeaking()` returns to
  rest.
- **Parts** — a catalog of swappable artwork (hair, eyes, outfit, glasses, …)
  with per-slot transforms. See [`docs/parts-v0.md`](./docs/parts-v0.md) for
  how parts are composed into the SVG.

## Documentation

- [`docs/schema-v0.md`](./docs/schema-v0.md) — authoring format (source of truth: `packages/schema`)
- [`docs/charbundle-v0.md`](./docs/charbundle-v0.md) — compiled bundle format
- [`docs/charpack-v0.md`](./docs/charpack-v0.md) — single-file `.charpack` format
- [`docs/parts-v0.md`](./docs/parts-v0.md) — parts rendering model and art direction

## Demos (in this repo)

```bash
pnpm install

pnpm run dev:web-basic     # vanilla runtime demo: behaviors, emotions, gaze, parts
pnpm run dev:react-basic   # the same character through @kugutu/react
pnpm run dev:studio        # parts-first character editor prototype
```

## Development

```bash
pnpm install
pnpm run build        # compile all packages (tsc -b)
pnpm run typecheck    # packages + apps
pnpm run check        # build + validate examples
```

Monorepo layout: `packages/*` are the published libraries, `apps/*` are demo
apps and the Studio prototype, `docs/*` are format specs, and
[`execution-plan.md`](./execution-plan.md) tracks the roadmap.

## Status

Kugutu is `v0.x`: the source and bundle formats are still evolving and may
change between minor versions. Feedback and issues are welcome.

## License

[MIT](./LICENSE)

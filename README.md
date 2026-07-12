# Kugutu

Kugutu is a programmable 2D character platform for apps and AI interfaces.

https://github.com/user-attachments/assets/f4635eea-4198-4834-bb54-b9cec2b97019

Current status:

- `schema v0` is defined in [`@kugutu/schema`](./packages/schema)
- `parts v0` now models Mii-like part catalogs and selections
- `.charpack` packs the composed SVG and runtime data into one app-ready file
- a minimal compiler, CLI, React binding, and web runtime are implemented in TypeScript
- `apps/web-basic` is a browser demo wired to the runtime
- `apps/react-basic` is a React demo wired through `@kugutu/react`
- `apps/studio` is a local parts-first editor prototype
- the execution plan lives in [`execution-plan.md`](./execution-plan.md)

Next milestone:

`Turn the Studio prototype into a 5-minute custom mascot flow.`

Quick check:

```bash
pnpm install
pnpm run check
pnpm run validate:example
pnpm run build:example
pnpm run sync:web-basic-demo
pnpm run build:react-basic
pnpm run build:studio
```

CLI smoke flow:

```bash
pnpm run kugutu -- init /tmp/kugutu-demo --template avatar-lite --id demo-mascot --force
pnpm run kugutu -- import /tmp/kugutu-demo/character.json apps/web-basic/public/avatar.svg --copy
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json blink
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json look-at
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json breathing
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json mouth-open
pnpm run kugutu -- build /tmp/kugutu-demo/character.json --out /tmp/kugutu-demo/avatar.charbundle.json
pnpm run kugutu -- lint /tmp/kugutu-demo/character.json
```

## Parts rendering model

A selected part renders only if the SVG can represent it. There are two ways:

1. **Baked variant group** — the master SVG already contains
   `<g data-kugutu-variant-slot="<part-slot>" data-kugutu-variant-id="<part-id>">…</g>`.
   The compiler toggles visibility per selection.
2. **File-based anchor part** — the catalog item's `asset` points to an SVG
   fragment drawn around its own local origin, and the master rig has a
   `<g data-kugutu-slot-mount="<part-slot>">` mount positioned at that slot's
   anchor. The compiler injects the fragment as a variant group at the mount, so
   CLI/agent-added parts render without hand-editing the rig. Paired slots
   (`eye`, `brow`) have a left mount and a mirrored right mount, so one fragment
   fills both sides. The selected part's transform (position/scale/rotation/
   spacing) and color are baked onto its variant group, and the runtime
   `setPart`/`tunePart` adjust the same groups live. Add
   `data-kugutu-color-preserve` directly to any painted SVG element whose
   authored fill/stroke must survive a color override, such as an eye's white
   sclera or highlight.

   A part that must wrap around another rig element can place its foreground
   subtree on `data-kugutu-part-layer="front"`; a matching mount combines
   `data-kugutu-slot-mount="<part-slot>"` with
   `data-kugutu-slot-layer="front"`. The compiler keeps unmarked artwork in the
   default mount and injects only the marked subtree into the named layer. If an
   older rig has no matching layer mount, the original fragment stays intact in
   its default mount.

If a selected part has neither, the character would render nothing. `kugutu lint`
(and the compiler) flag this instead of silently producing an invisible
character.

### Art direction

The demo mascot (`apps/web-basic/source/rig.svg` + `parts/**`) is authored in a
single flat-rounded style with a shared palette (skin / ink / hair / accent),
consistent stroke weights, and a fixed anchor grid. Because every part is drawn
around its slot anchor and shares the palette, any combination of eyes, brows,
mouth, hair, nose, and outfit stays aligned and visually coherent — the Mii-style
mix-and-match the platform is built around.

Parts smoke flow (anchor-based demo character):

```bash
SRC=apps/web-basic/source
pnpm run kugutu -- list-parts $SRC/avatar.character.json --slot eye
pnpm run kugutu -- lint $SRC/avatar.character.json $SRC/rig.svg
pnpm run kugutu -- pack $SRC/avatar.character.json $SRC/rig.svg --out /tmp/kugutu-mascot.charpack
```

Part fragments live in `$SRC/parts/<slot>/<id>.svg` (drawn around their slot
anchor) and are injected at build time; `set-part`/`tune-part` then edit the
selection/transform in `avatar.character.json`.

Runtime embed (actor API):

```ts
import { Kugutu } from "@kugutu/runtime-web";

// One line: fetch the .charpack, mount it into the target, start it.
const actor = await Kugutu.load("/mascot.charpack", "#stage");

actor.lookAt({ x: 0.2, y: -0.1 });
actor.setEmotion("happy", 0.8); // data-driven expression from the bundle
actor.setMouthOpen(0.4);
actor.playGesture("nod");       // data-driven gesture from the bundle

// Viseme-based lip-sync (cue timings as a TTS engine would emit them)
actor.speak([
  { viseme: "PP", startMs: 0 },
  { viseme: "aa", startMs: 120 },
  { viseme: "O", startMs: 240 },
  { viseme: "sil", startMs: 360 },
]);

// Mii-style live part editing
actor.setPart("hair.front", "hair-front-bob-01");
actor.setVariant("outfit", "outfit-stage-01");
actor.tunePart("eye", { scale: 1.1, spacing: 8 });
```

`Kugutu.load` also accepts a `CharPack` object instead of a URL, and a
`HTMLElement` instead of a selector. The lower-level
`createCharacterPlayer(bundle, svgRoot)` / `createCharacterPlayerFromPack(pack, container)`
entry points remain available.

## Expressions & gestures (data-driven)

Expressions (`setEmotion`) and gestures (`playGesture`) are **data**, not
hard-coded runtime logic. Each is a set of per-slot offsets:

- **Expression** — a static pose scaled by intensity (e.g. `happy` raises brows
  and widens the mouth).
- **Gesture** — a timed keyframe animation played once or looped (e.g. `nod`,
  `shake`, `bounce`, `wave`).

A built-in library (`happy`/`sad`/`angry`/`surprised`, plus gestures including
`wave`/`wave-left`, `raise-hand`/`raise-hand-left`, `point`/`point-left`, and
`ok`/`ok-left`) is compiled into every bundle, pruned to the slots a character
actually binds (so `wave` is dropped when there are no arm slots). Authors
override or extend
them by id in the source `expressions` / `gestures` arrays, or pull a built-in
into the source to tune:

```bash
pnpm run kugutu -- add-expression /tmp/kugutu-demo/character.json happy --replace
pnpm run kugutu -- add-gesture /tmp/kugutu-demo/character.json wave
```

The runtime carries no preset poses — it simply applies whatever the bundle
declares.

### Lip-sync (visemes)

`speak(cues)` drives viseme-based lip-sync. A viseme is a mouth shape
(`open` 0..1 + optional `width`), and a cue is a viseme with a start time
(relative to the call, matching TTS viseme-event offsets). The runtime
interpolates between cues with smoothing (reusing the `mouth-open` behavior's
`smoothing`/`maxOpen` params) and returns to rest when the stream ends;
`stopSpeaking()` closes the mouth immediately. A built-in 15-shape viseme
library (`sil`, `aa`, `E`, `O`, `U`, `PP`, `FF`, …) is compiled into the bundle
and can be overridden per id via `visemes` in the source.

Web demo:

```bash
pnpm run dev:web-basic
# open the Vite URL shown in the terminal
```

React demo:

```bash
pnpm run dev:react-basic
# open the Vite URL shown in the terminal
```

Studio:

```bash
pnpm run dev:studio
# open the Vite URL shown in the terminal
```

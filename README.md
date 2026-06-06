# Kugutu

Kugutu is a programmable 2D character platform for apps and AI interfaces.

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
2. **File-based part asset** — the catalog item's `asset` points to an SVG
   fragment on disk and the master SVG has a `<g data-kugutu-slot-mount="<part-slot>">`
   element. The compiler injects the fragment as a variant group at build time,
   so CLI/agent-added parts render without hand-editing the master SVG.

If a selected part has neither, the character would render nothing. `kugutu lint`
(and the compiler) flag this instead of silently producing an invisible
character.

Parts smoke flow:

```bash
cp apps/web-basic/source/avatar-lite.character.json /tmp/kugutu-parts.character.json
pnpm run kugutu -- add-part /tmp/kugutu-parts.character.json eye-wide-01 --slot eye --asset parts/eyes/wide-01.svg --nodes eye.l=eye_left,eye.r=eye_right --editable position,scale,spacing,color
pnpm run kugutu -- list-parts /tmp/kugutu-parts.character.json --slot eye
pnpm run kugutu -- set-part /tmp/kugutu-parts.character.json eye eye-wide-01
pnpm run kugutu -- tune-part /tmp/kugutu-parts.character.json eye --scale 1.1 --spacing 8
pnpm run kugutu -- pack /tmp/kugutu-parts.character.json apps/web-basic/source/avatar.base.svg --out /tmp/kugutu-parts.charpack
```

Runtime embed:

```ts
const pack = await fetch("/mascot.charpack").then((response) => response.json());
const player = createCharacterPlayerFromPack(pack, container);

player.lookAt({ x: 0.2, y: -0.1 });
player.setEmotion("happy", 0.8);
```

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

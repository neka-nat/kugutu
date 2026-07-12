# Parts v0 — rendering model

How a selected part in `parts.selections` becomes visible artwork. See
[`schema-v0.md`](./schema-v0.md) for the catalog/selection source format.

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

## Art direction

The demo mascot (`apps/web-basic/source/rig.svg` + `parts/**`) is authored in a
single flat-rounded style with a shared palette (skin / ink / hair / accent),
consistent stroke weights, and a fixed anchor grid. Because every part is drawn
around its slot anchor and shares the palette, any combination of eyes, brows,
mouth, hair, nose, and outfit stays aligned and visually coherent — the Mii-style
mix-and-match the platform is built around.

Parts smoke flow (anchor-based demo character, from the repo root):

```bash
SRC=apps/web-basic/source
pnpm run kugutu -- list-parts $SRC/avatar.character.json --slot eye
pnpm run kugutu -- lint $SRC/avatar.character.json $SRC/rig.svg
pnpm run kugutu -- pack $SRC/avatar.character.json $SRC/rig.svg --out /tmp/kugutu-mascot.charpack
```

Part fragments live in `$SRC/parts/<slot>/<id>.svg` (drawn around their slot
anchor) and are injected at build time; `set-part`/`tune-part` then edit the
selection/transform in `avatar.character.json`.

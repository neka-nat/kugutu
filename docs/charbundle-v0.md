# Charbundle v0

`charbundle v0` is the compiled runtime control data produced from a Kugutu character document.
For app distribution, prefer `.charpack`, which embeds this bundle together with the composed SVG in one file.

## Goals

- stable input for runtimes
- detached from authoring-only metadata
- small enough to embed in web apps

## Top-level shape

```json
{
  "bundleVersion": "0.1.0",
  "sourceSchemaVersion": "0.1.0",
  "character": {
    "id": "assistant-mascot",
    "template": "avatar-lite"
  },
  "assets": [],
  "bindings": {
    "slots": {}
  },
  "parts": {
    "catalog": {},
    "selections": {}
  },
  "presets": [],
  "behaviors": [],
  "expressions": [],
  "gestures": [],
  "visemes": {},
  "runtime": {
    "api": []
  }
}
```

`parts` and `presets` are optional; `expressions`, `gestures`, and `visemes`
are always present (the compiler fills them from the built-in libraries when
the source does not override them).

## Runtime contract in v0

`runtime.api` lists the actor methods the bundle supports:

- `lookAt`
- `playBehavior`
- `playGesture`
- `setEmotion`
- `setMouthOpen`
- `speak`
- `setPart`
- `setVariant`
- `tunePart`
- `applyPreset`

## Expression / gesture / viseme data in v0

`expressions`, `gestures`, and `visemes` carry the data behind `setEmotion`,
`playGesture`, and `speak`. The compiler merges the built-in libraries with the
source document's overrides (by id) and prunes entries down to the slots the
character actually binds — a character without arm slots gets no `wave`
gesture. The runtime carries no preset poses; it applies whatever the bundle
declares.

## Binding rule in v0

Slot bindings are compiled as `transform.<nodeId>`.

Examples:

- `head -> transform.head_group`
- `eye.l -> transform.eye_left`
- `mouth -> transform.mouth_group`

## Behavior params in v0

Compiled behaviors keep their numeric `params` so the runtime can reuse the same timing and amplitude values as the source document.

## Parts metadata in v0

If the source character includes `parts`, the compiler preserves it in the bundle.
The web runtime still drives the final SVG through semantic slot bindings; parts metadata is included so Studio, CLI flows, and future runtimes can inspect the selected face, hair, eyes, mouth, and outfit variants without reading the source document.

`composeCharacterSvg(document, svgText)` can also bake selected part transforms into a generated SVG by wrapping selected part nodes. The runtime then animates the inner slot nodes while the composed SVG keeps the base Mii-like tuning.

## Non-goals

- binary packing
- mesh deformation data
- runtime-side SVG part compositing — the compiler injects and bakes part
  artwork at build time; the runtime only toggles and tunes the injected
  variant groups (`setPart` / `tunePart`)
- advanced state machines
- cross-platform asset packaging

The bundle is intentionally JSON-shaped for now so compiler and runtime can iterate quickly.

# Schema v0

`schema v0` is the source format for authoring Kugutu characters.

## Design goals

- text-first and git-friendly
- semantic slot assignment instead of layer-name coupling
- parts-first avatar customization that can be driven by Studio, CLI, or agents
- behavior presets reusable across characters
- small enough to edit by hand or from an agent

## Top-level shape

```json
{
  "schemaVersion": "0.1.0",
  "character": {
    "id": "assistant-mascot",
    "template": "avatar-lite"
  },
  "assets": {
    "primary": "assets/avatar.svg"
  },
  "slots": {},
  "parts": {
    "catalog": {},
    "selections": {}
  },
  "presets": [],
  "behaviors": [],
  "expressions": [],
  "gestures": [],
  "visemes": {}
}
```

`parts`, `presets`, `expressions`, `gestures`, and `visemes` are optional.

## Templates

- `avatar-lite`: face + upper torso
- `mascot-upper`: upper-body mascot with arms
- `vtuber-lite`: face-first avatar with stronger eye controls

## Canonical behaviors in v0

- `blink`
- `look-at`
- `breathing`
- `mouth-open`
- `arm-idle`

## Expressions, gestures, and visemes in v0

Expressions (`setEmotion`), gestures (`playGesture`), and visemes (`speak`
lip-sync) are data, not runtime logic. Built-in libraries are compiled into
every bundle; the source arrays override or extend entries **by id**.

- `expressions[]` — `{ id, poses }`: a static pose per slot
  (translate/rotate/scale offsets at intensity = 1), scaled by the
  `setEmotion` intensity. Built-ins: `happy`, `sad`, `angry`, `surprised`.
- `gestures[]` — `{ id, durationMs, loop?, tracks, keywords? }`: timed
  keyframe tracks per slot. `keywords` lets `playGestureForText(text)` pick a
  gesture by intent. Built-ins include `nod`, `shake`, `bounce`, `wave`,
  `raise-hand`, `point`, `ok` (plus `-left` variants).
- `visemes` — map of viseme id (Oculus/JALI-style: `sil`, `aa`, `E`, `O`,
  `PP`, …) to a mouth pose `{ open, width? }`.

CLI: `add-expression` / `add-gesture` copy a built-in into the source for
tuning.

## Presets in v0

`presets[]` — `{ id, displayName?, description?, selections }`: a named set of
part selections (with transforms/colors) applied in one call via
`applyPreset(presetId)` at runtime. Useful for outfits, seasons, or whole
looks.

## Parts catalog in v0

`parts` is optional, but it is the source of truth for Mii-like character editing.

- `parts.catalog` defines reusable part assets and the compatible part slot.
- `parts.selections` chooses the active part for each slot.
- `parts.selections.<slot>.transform` stores simple tuning values such as `x`, `y`, `scale`, `rotation`, `spacing`, `color`, and `layer`.
- CLI commands such as `add-part`, `list-parts`, `set-part`, and `tune-part` edit this shape directly.

Canonical part slots in v0:

- `face`
- `hair.front`
- `hair.back`
- `hair.accessory`
- `eye`
- `brow`
- `nose`
- `mouth`
- `glasses`
- `beard`
- `outfit`

The accessory slots (`hair.accessory`, `glasses`, `beard`) are independent so a
character can wear all three at once. Catalogs typically include a `*-none`
variant per accessory slot so the default look is bare.

Example:

```json
{
  "parts": {
    "catalog": {
      "eye-round-01": {
        "id": "eye-round-01",
        "slot": "eye",
        "asset": "parts/eyes/round-01.svg",
        "nodes": {
          "eye.l": "eye_left",
          "eye.r": "eye_right"
        },
        "editable": ["position", "scale", "spacing", "color"]
      }
    },
    "selections": {
      "eye": {
        "partId": "eye-round-01",
        "transform": {
          "scale": 1.1,
          "spacing": 8
        }
      }
    }
  }
}
```

## Source of truth

Use these files as the canonical references:

- `packages/schema/src/slots.ts`
- `packages/schema/src/parts.ts`
- `packages/schema/src/templates.ts`
- `packages/schema/src/behaviors.ts`
- `packages/schema/src/expressions.ts`
- `packages/schema/src/gestures.ts`
- `packages/schema/src/visemes.ts`
- `packages/schema/character.schema.json`

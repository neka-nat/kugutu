# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kugutu is a programmable 2D character platform for apps and AI interfaces. It provides a text-first source format (JSON) that compiles into optimized runtime bundles for rendering animated SVG characters in the browser. Think of it as a code-driven alternative to Rive/Spine/Live2D targeting developers embedding interactive avatars/mascots.

## Commands

```bash
# Build (TypeScript compilation)
npm run build

# Type check only
npm run typecheck

# Build + validate examples
npm run check

# Validate a character definition
npm run validate:example    # validates avatar-lite example

# Build example to /tmp
npm run build:example

# Sync compiled bundle to web-basic demo
npm run sync:web-basic-demo

# Dev server for web-basic demo (Vite)
npm run dev:web-basic

# Production build & preview for web-basic
npm run build:web-basic
npm run preview:web-basic
```

No test framework is configured yet. Validation is done via `npm run check` which runs `scripts/check.ts`.

## Architecture

```
Source (.character.json) → [Validator] → [Compiler] → CharBundle (.charbundle.json) → [Web Runtime] → Animated SVG
```

### Monorepo Packages

- **`packages/schema`** — Type definitions, slot taxonomy (16 semantic slots), behavior definitions (blink, look-at, breathing, mouth-open), validation logic, JSON Schemas, and character templates. This is the foundational package everything else depends on.
- **`packages/compiler`** — Transforms `CharacterDefinition` → `CharBundle`. Maps semantic slots to SVG transform channels and compiles behavior targets into animation channels. Entry point: `buildCharacterBundle()`.
- **`packages/runtime-web`** — Browser runtime that animates SVG elements using CSS transforms. Entry point: `createCharacterPlayer(bundle, svgRoot)` returns a `CharacterPlayer` with methods like `lookAt()`, `playBehavior()`, `setEmotion()`, `setMouthOpen()`, `start()/stop()`.
- **`packages/cli`** — CLI wrapping compiler with `validate` and `build` commands.
- **`packages/react`** — React binding. Exports `KugutuCharacter` (bundle + SVG via `svgText`/`svgUrl`) and `KugutuCharacterPack` (single `.charpack` prop) components that manage player lifecycle, plus `onPlayerReady` for imperative access to the `CharacterPlayer` API. Supports React 18/19.

### Apps

- **`apps/web-basic`** — Vite-based interactive demo loading SVG + charbundle, with UI controls for behaviors/emotions and pointer-tracking gaze.
- **`apps/react-basic`** — React demo embedding the character through `@kugutu/react` (charpack loading, emotion/mouth controls, pointer-tracking gaze).
- **`apps/studio`** — Local parts-first editor prototype.

### Key Design Concepts

- **Semantic slots** — Characters use named slots (e.g., `eye.l`, `mouth`, `torso`) mapped to SVG node IDs, not raw layer names.
- **Behavior system** — 4 behavior types with typed params. Behaviors are reusable across characters sharing compatible slots. Compiler maps behavior targets to specific transform channels (e.g., blink → `scaleY` on eye slots).
- **Templates** — `avatar-lite`, `mascot-upper`, `vtuber-lite` define which slots are required/optional for a character type.
- **Two-layer format** — Human-readable source format for authoring/git diffs; optimized bundle format for runtime consumption.

## Tech Stack

- TypeScript 6 (strict mode, ES2022/NodeNext)
- Vite 8 (web-basic app)
- npm workspaces
- No linter or test framework configured yet

## Documentation

- `concept.md` — Product strategy and vision (Japanese)
- `execution-plan.md` — Implementation roadmap with phases (Japanese)
- `docs/schema-v0.md` — Schema design goals and source format spec
- `docs/charbundle-v0.md` — Runtime bundle format spec
- `docs/charpack-v0.md` — Single-file `.charpack` format spec
- `docs/parts-v0.md` — Parts rendering model and art direction

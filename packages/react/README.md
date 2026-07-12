# `@kugutu/react`

React binding for [Kugutu](https://github.com/neka-nat/kugutu) — embed an
animated character with one component. Requires React 18 or 19.

```bash
npm install @kugutu/react
```

## Usage

```tsx
import { useState } from "react";
import { KugutuCharacterPack, type CharacterPlayer } from "@kugutu/react";

function Mascot({ pack }) {
  const [player, setPlayer] = useState<CharacterPlayer | null>(null);

  return (
    <KugutuCharacterPack
      pack={pack}
      onPlayerReady={setPlayer}
      style={{ width: 320 }}
    />
  );
}

// Drive the character through the player:
player?.setEmotion("happy", 0.8);
player?.playGesture("wave");
player?.lookAt({ x: 0.2, y: -0.1 });
```

## Components

- `<KugutuCharacterPack pack={pack} />` — renders a single-file `.charpack`
  (composed SVG + animation data).
- `<KugutuCharacter bundle={bundle} svgText="..." />` or
  `<KugutuCharacter bundle={bundle} svgUrl="/avatar.svg" />` — renders a
  charbundle with separate SVG artwork.

Shared props: `autoStart` (default `true`), `className`, `style`, and
`onPlayerReady(player)`, which exposes the full actor API from
[`@kugutu/runtime-web`](https://www.npmjs.com/package/@kugutu/runtime-web)
(`lookAt`, `setEmotion`, `playGesture`, `speak`, `setPart`, …). The callback
receives `null` while no player is mounted.

> **Note:** `KugutuCharacter` injects the provided SVG markup into the DOM
> as-is. Only pass SVG content from sources you trust.

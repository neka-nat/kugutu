# `@kugutu/react`

Thin React binding for the Kugutu web runtime.

Current API:

- `<KugutuCharacterPack pack={pack} />`
- `<KugutuCharacter bundle={bundle} svgUrl="/avatar.svg" />`
- `onPlayerReady(player)` exposes the same actor API as `@kugutu/runtime-web`

Example:

```ts
import { KugutuCharacterPack } from "@kugutu/react";

<KugutuCharacterPack
  pack={pack}
  onPlayerReady={(player) => player?.lookAt({ x: 0, y: 0 })}
/>;
```

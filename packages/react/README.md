# `@kugutu/react`

Thin React binding for the Kugutu web runtime.

Current API:

- `<KugutuCharacter bundle={bundle} svgUrl="/avatar.svg" />`
- `onPlayerReady(player)` exposes the same actor API as `@kugutu/runtime-web`

Example:

```ts
import { KugutuCharacter } from "@kugutu/react";

<KugutuCharacter
  bundle={bundle}
  svgUrl="/avatar.svg"
  onPlayerReady={(player) => player?.lookAt({ x: 0, y: 0 })}
/>;
```

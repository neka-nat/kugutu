# `@kugutu/runtime-web`

Minimal web runtime for binding a Kugutu charpack or charbundle to an SVG root.

Current API:

- `createCharacterPlayer(bundle, svgRoot)`
- `createCharacterPlayerFromPack(pack, container)`
- `player.lookAt({ x, y })`
- `player.setMouthOpen(value)`
- `player.playBehavior(id)`
- `player.start()` / `player.stop()`

Charpack usage:

```ts
const pack = await fetch("/assistant.charpack").then((response) => response.json());
const player = createCharacterPlayerFromPack(pack, container);

player.setEmotion("happy", 0.8);
player.lookAt({ x: 0.2, y: -0.1 });
```

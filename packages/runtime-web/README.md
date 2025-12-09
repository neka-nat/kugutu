# `@kugutu/runtime-web`

Minimal web runtime for binding a compiled Kugutu charbundle to an SVG root.

Current API:

- `createCharacterPlayer(bundle, svgRoot)`
- `player.lookAt({ x, y })`
- `player.setMouthOpen(value)`
- `player.playBehavior(id)`
- `player.start()` / `player.stop()`

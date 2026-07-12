# `@kugutu/compiler`

Headless compiler for [Kugutu](https://github.com/neka-nat/kugutu) — turns
character source documents into runtime charbundles, composed SVG assets, and
single-file charpacks. This is the library behind
[`@kugutu/cli`](https://www.npmjs.com/package/@kugutu/cli); use it directly to
build characters programmatically (build scripts, servers, agents).

```bash
npm install @kugutu/compiler
```

## API

- `buildCharacterBundle(document)` — compile a `CharacterDefinition` into a `CharBundle`
- `composeCharacterSvg(document, svgText, options?)` — bake part selections/transforms into the SVG
- `buildCharacterPack(document, svgText, options?)` — produce a single-file `CharPack`
- `lintCharacter(document, svgText?)` — authoring diagnostics (missing nodes, invisible parts, …)

```ts
import { buildCharacterPack } from "@kugutu/compiler";

const pack = buildCharacterPack(characterDefinition, svgText);
await writeFile("mascot.charpack", JSON.stringify(pack));
```

Types and validators come from
[`@kugutu/schema`](https://www.npmjs.com/package/@kugutu/schema); the pack is
rendered by
[`@kugutu/runtime-web`](https://www.npmjs.com/package/@kugutu/runtime-web).

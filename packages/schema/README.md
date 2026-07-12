# `@kugutu/schema`

Types, validators, and taxonomies for
[Kugutu](https://github.com/neka-nat/kugutu) character source files, compiled
bundles, and charpacks. Dependency-free.

```bash
npm install @kugutu/schema
```

## Contents

- TypeScript types: `CharacterDefinition`, `CharBundle`, `CharPack`, …
- Dependency-free validators: `validateCharacterDefinition`, `validateCharBundle`
- Slot taxonomy (16 semantic slots) and part-slot taxonomy
- Behavior specs (`blink`, `look-at`, `breathing`, `mouth-open`, `arm-idle`)
- Character templates (`avatar-lite`, `mascot-upper`, `vtuber-lite`)
- JSON Schemas, importable as
  `@kugutu/schema/character.schema.json` and
  `@kugutu/schema/charbundle.schema.json`
- Example documents in [`examples/`](./examples)

Format specs live in the
[project docs](https://github.com/neka-nat/kugutu/tree/main/docs).

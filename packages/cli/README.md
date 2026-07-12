# `@kugutu/cli`

CLI for creating, editing, validating, and building
[Kugutu](https://github.com/neka-nat/kugutu) characters.

```bash
npm install -g @kugutu/cli
# or run ad hoc:
npx @kugutu/cli validate character.json
```

## Typical flow

```bash
kugutu init my-mascot --template avatar-lite --id my-mascot
kugutu import my-mascot/character.json artwork.svg --copy
kugutu add-behavior my-mascot/character.json blink
kugutu add-behavior my-mascot/character.json look-at
kugutu lint my-mascot/character.json
kugutu pack my-mascot/character.json artwork.svg --out my-mascot.charpack
```

The resulting `.charpack` is a single JSON file you can serve to
[`@kugutu/runtime-web`](https://www.npmjs.com/package/@kugutu/runtime-web).

## Commands

```
kugutu init <project-dir> [--template avatar-lite] [--id mascot] [--force]
kugutu import <source.json> <asset.svg> [--copy]
kugutu set-slot <source.json> <slot> <node-id>
kugutu add-part <source.json> <part-id> --slot <part-slot> --asset <asset.svg> [--nodes slot=node,...] [--display-name "..."] [--editable position,scale,...] [--replace]
kugutu list-parts <source.json> [--slot <part-slot>]
kugutu set-part <source.json> <part-slot> <part-id>
kugutu tune-part <source.json> <part-slot> [--x 0] [--y 0] [--scale 1] [--rotation 0] [--spacing 0] [--color #000] [--layer 0]
kugutu add-behavior <source.json> <type> [--id blink-default] [--targets eye.l,eye.r] [--replace]
kugutu add-expression <source.json> <id> [--replace]
kugutu add-gesture <source.json> <id> [--replace]
kugutu compose-svg <source.json> <input.svg> --out <output.svg>
kugutu pack <source.json> <input.svg> --out <output.charpack> [--no-source]
kugutu validate <source.json>
kugutu lint <source.json> [<input.svg>]
kugutu build <source.json> --out <bundle.json>
```

Behavior types: `blink`, `look-at`, `breathing`, `mouth-open`, `arm-idle`.
Templates: `avatar-lite`, `mascot-upper`, `vtuber-lite`.

Format specs live in the
[project docs](https://github.com/neka-nat/kugutu/tree/main/docs).

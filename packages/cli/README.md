# `@kugutu/cli`

CLI for creating, editing, validating, and building Kugutu source files.

Current commands:

```bash
kugutu init <project-dir> [--template avatar-lite] [--id mascot] [--force]
kugutu import <source.json> <asset.svg> [--copy]
kugutu set-slot <source.json> <slot> <node-id>
kugutu add-part <source.json> <part-id> --slot <part-slot> --asset <asset.svg> [--nodes slot=node,...] [--replace]
kugutu list-parts <source.json> [--slot <part-slot>]
kugutu set-part <source.json> <part-slot> <part-id>
kugutu tune-part <source.json> <part-slot> [options]
kugutu add-behavior <source.json> <type> [--id blink-default] [--targets eye.l,eye.r] [--replace]
kugutu add-expression <source.json> <id> [--replace]
kugutu add-gesture <source.json> <id> [--replace]
kugutu compose-svg <source.json> <input.svg> --out <output.svg>
kugutu pack <source.json> <input.svg> --out <output.charpack> [--no-source]
kugutu validate <source.json>
kugutu lint <source.json> [<input.svg>]
kugutu build <source.json> --out <bundle.json>
```

From the repo:

```bash
pnpm run kugutu -- init /tmp/kugutu-demo --template avatar-lite --id demo-mascot --force
pnpm run kugutu -- import /tmp/kugutu-demo/character.json apps/web-basic/public/avatar.svg --copy
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json blink
pnpm run kugutu -- build /tmp/kugutu-demo/character.json --out /tmp/kugutu-demo/avatar.charbundle.json
```

Parts flow (anchor-based demo character):

```bash
SRC=apps/web-basic/source
pnpm run kugutu -- list-parts $SRC/avatar.character.json --slot eye
pnpm run kugutu -- lint $SRC/avatar.character.json $SRC/rig.svg
pnpm run kugutu -- pack $SRC/avatar.character.json $SRC/rig.svg --out /tmp/kugutu-mascot.charpack
```

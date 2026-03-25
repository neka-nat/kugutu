# `@kugutu/cli`

CLI for creating, editing, validating, and building Kugutu source files.

Current commands:

```bash
kugutu init <project-dir> [--template avatar-lite] [--id mascot] [--force]
kugutu import <source.json> <asset.svg> [--copy]
kugutu set-slot <source.json> <slot> <node-id>
kugutu add-behavior <source.json> <type> [--id blink-default] [--targets eye.l,eye.r] [--replace]
kugutu validate <source.json>
kugutu build <source.json> --out <bundle.json>
```

From the repo:

```bash
pnpm run kugutu -- init /tmp/kugutu-demo --template avatar-lite --id demo-mascot --force
pnpm run kugutu -- import /tmp/kugutu-demo/character.json apps/web-basic/public/avatar.svg --copy
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json blink
pnpm run kugutu -- build /tmp/kugutu-demo/character.json --out /tmp/kugutu-demo/avatar.charbundle.json
```

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
kugutu compose-svg <source.json> <input.svg> --out <output.svg>
kugutu pack <source.json> <input.svg> --out <output.charpack> [--no-source]
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

Parts flow:

```bash
cp apps/web-basic/source/avatar-lite.character.json /tmp/kugutu-parts.character.json
pnpm run kugutu -- add-part /tmp/kugutu-parts.character.json eye-wide-01 --slot eye --asset parts/eyes/wide-01.svg --nodes eye.l=eye_left,eye.r=eye_right --editable position,scale,spacing,color
pnpm run kugutu -- list-parts /tmp/kugutu-parts.character.json --slot eye
pnpm run kugutu -- set-part /tmp/kugutu-parts.character.json eye eye-wide-01
pnpm run kugutu -- tune-part /tmp/kugutu-parts.character.json eye --scale 1.1 --spacing 8
pnpm run kugutu -- pack /tmp/kugutu-parts.character.json apps/web-basic/source/avatar.base.svg --out /tmp/kugutu-parts.charpack
```

# Kugutu

Kugutu is a programmable 2D character platform for apps and AI interfaces.

Current status:

- `schema v0` is defined in [`@kugutu/schema`](./packages/schema)
- a minimal compiler, CLI, React binding, and web runtime are implemented in TypeScript
- `apps/web-basic` is a browser demo wired to the runtime
- `apps/react-basic` is a React demo wired through `@kugutu/react`
- the execution plan lives in [`execution-plan.md`](./execution-plan.md)
- `studio` is still scaffolded only

Next milestone:

`Polish the SVG import and React example into a 5-minute hello mascot flow.`

Quick check:

```bash
pnpm install
pnpm run check
pnpm run validate:example
pnpm run build:example
pnpm run sync:web-basic-demo
pnpm run build:react-basic
```

CLI smoke flow:

```bash
pnpm run kugutu -- init /tmp/kugutu-demo --template avatar-lite --id demo-mascot --force
pnpm run kugutu -- import /tmp/kugutu-demo/character.json apps/web-basic/public/avatar.svg --copy
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json blink
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json look-at
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json breathing
pnpm run kugutu -- add-behavior /tmp/kugutu-demo/character.json mouth-open
pnpm run kugutu -- build /tmp/kugutu-demo/character.json --out /tmp/kugutu-demo/avatar.charbundle.json
```

Web demo:

```bash
pnpm run dev:web-basic
# open the Vite URL shown in the terminal
```

React demo:

```bash
pnpm run dev:react-basic
# open the Vite URL shown in the terminal
```

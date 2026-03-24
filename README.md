# Kugutu

Kugutu is a programmable 2D character platform for apps and AI interfaces.

Current status:

- `schema v0` is defined in [`@kugutu/schema`](./packages/schema)
- a minimal compiler, CLI, and web runtime are implemented in TypeScript
- `apps/web-basic` is a browser demo wired to the runtime
- the execution plan lives in [`execution-plan.md`](./execution-plan.md)
- `studio` is still scaffolded only

Next milestone:

`Import one layered SVG, assign slots, add blink / look-at / breathing, and render it in React.`

Quick check:

```bash
npm run check
npm run validate:example
npm run build:example
npm run sync:web-basic-demo
```

Web demo:

```bash
npm run dev:web-basic
# open the Vite URL shown in the terminal
```

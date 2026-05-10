# `apps/studio`

Local parts-first editor prototype for Kugutu characters.
The initial editable character is loaded from `apps/web-basic/public/avatar.charpack`.

Current surface:

- part slot navigation
- part selection from `parts.catalog`
- transform tuning for selected parts
- live composed SVG preview
- runtime controls for blink, look-at, emotion, and mouth open
- browser export for a single `.charpack` file

From the repo:

```bash
pnpm run dev:studio
pnpm run build:studio
```

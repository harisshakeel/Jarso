---
name: ui-component
description: Add shadcn/ui primitives or build shared/feature UI components following project conventions (Tailwind v4, Base UI, barrels, accessibility, child-friendly copy). Use when adding or changing UI.
---

# UI component

## shadcn primitive

```bash
pnpm dlx shadcn@latest add <component>
```

Then add `export * from "./<component>";` to `src/components/ui/index.ts` and run `pnpm lint:fix`. Don't hand-edit generated primitives unless necessary; wrap them instead.

## Where components go

| Component | Location |
| --- | --- |
| Generic primitive | `src/components/ui/` (shadcn) |
| App-wide composite (layout, nav) | `src/components/<group>/` with `index.ts` |
| Domain-specific | `src/features/<f>/components/`, exported from the feature barrel |

## Rules

- Read `docs/design.md` first. Use its tokens (`primary`, `secondary`, `accent`, `gold`, status chips), type styles, radius and motion rules; never introduce an ad-hoc colour or font.

- Server Component by default; `"use client"` only for state/effects/browser APIs, at the leaf.
- Presentational: data via props; no fetching inside shared components.
- Import primitives from `@/components/ui`, `cn` from `@/lib`.
- Accessibility: labels for every input, `aria-invalid` + described errors, keyboard reachable, visible focus, colour contrast AA.
- Copy for ages 11–14: short, concrete, encouraging; avoid jargon; never shame spending.
- Money displayed via a single formatter from minor units — no ad-hoc `toFixed`.
- New screens follow `docs/design.md` sections 5 (layout), 6 (components) and 10 (role emphasis).

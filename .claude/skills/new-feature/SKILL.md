---
name: new-feature
description: Scaffold a new domain feature module in src/features/<name> (schema → repository → service → actions/route → components → barrels → tests). Use when adding a new domain area such as jars, goals, diary, lessons, or guide.
---

# New feature module

Read `docs/architecture.md` and `docs/conventions.md` first. Use `src/features/profiles` as the reference implementation.

## Steps

1. **Name** the feature: plural kebab-case noun (`savings-goals`, `diary-entries`).
2. **Database** (if it stores data): run the `db-migration` skill. RLS in the same migration. Then `pnpm db:reset && pnpm db:types`.
3. **Create the module:**

   ```
   src/features/<name>/
   ├── index.ts              # client-safe barrel
   ├── schemas.ts            # Zod input schemas + inferred types
   ├── types.ts              # domain types (camelCase), Row alias from @/types
   ├── components/
   └── server/
       ├── index.ts          # import "server-only"; export services
       ├── repository.ts     # import "server-only"; Supabase queries; row → domain mapping
       ├── service.ts        # import "server-only"; business rules; takes userId + validated input
       └── actions.ts        # "use server"; createAction(schema, handler) → assertUser → service
   ```

4. **Repository:** only file that names tables/columns. Accept a typed `SupabaseClient<Database>`; check every `error` and wrap in `AppError("INTERNAL", …, { cause })`.
5. **Service:** pure business logic. Throw `AppError` for expected failures (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`). No `next/*` imports except where unavoidable.
6. **Actions:** thin. `assertUser()` → service → `refresh()` / `revalidatePath()` / `updateTag()`.
7. **Route handlers** (only if non-UI callers need it): run `api-endpoint` skill.
8. **Components:** presentational, receive data via props. Data fetching happens in the page inside `<Suspense>`.
9. **Barrels:**
   - `index.ts`: `export *` from components + schemas, `export type *` from types, named re-exports of actions.
   - `server/index.ts`: starts with `import "server-only";`, named re-exports of services.
   - Internal imports are relative; cross-module imports use barrels.
10. **Route:** add page under `src/app/(app)/<route>/page.tsx`; add prefix to `protectedRoutePrefixes` in `src/config/site.ts` and `routes`.
11. **Tests:** schema tests + service tests (mock repository). E2E for the critical flow.
12. Run the `verify` skill.

## Domain rules (Jarso)

- Money is stored as **integer minor units** (`bigint` / `integer` cents) — never floats. Format only at the UI edge.
- Practice (fictional) money and recorded money are separate; never sum them.
- Jar transfers are not income. Model money movements as ledger entries with an explicit `kind`.
- Users are children 11–14: copy is simple, encouraging, and never asks for sensitive data.

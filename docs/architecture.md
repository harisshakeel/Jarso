# Architecture

Single Next.js 16 app (App Router) holding both frontend and backend. Supabase provides Postgres, Auth and Storage.

## Principles

1. **Feature modules own their domain.** Everything for a domain (UI, validation, data access, business logic) lives in `src/features/<name>/`.
2. **The route layer is thin.** `src/app/**` composes features. Pages, Route Handlers and Server Actions validate input, resolve the user, call a service, and render/return. No SQL, no business rules.
3. **Explicit server/client boundary.** Server-only code is fenced with `import "server-only"` and lives under `server/`. Barrels never mix the two.
4. **Defense in depth for auth.** Proxy does optimistic redirects; the DAL verifies the user; Postgres RLS is the final authority.
5. **Typed end to end.** Generated DB types → repository → domain types → Zod-validated inputs → typed `ActionResult` / JSON envelope.

## Layout

```
src/
├── app/                      # Routing only. Route groups don't affect URLs.
│   ├── (marketing)/          # Public pages
│   ├── (auth)/               # Login / signup (signed-in users bounced to /dashboard)
│   ├── (app)/                # Authenticated app shell
│   ├── auth/callback/        # Supabase PKCE code exchange
│   ├── api/                  # Route Handlers: /api/health, /api/v1/*
│   ├── layout.tsx            # Root layout + providers
│   └── error.tsx, global-error.tsx, not-found.tsx
├── features/
│   └── <feature>/
│       ├── index.ts          # PUBLIC client-safe barrel: components, schemas, types, actions
│       ├── schemas.ts        # Zod schemas (shared client + server)
│       ├── types.ts          # Domain types
│       ├── components/       # Presentational + client components
│       └── server/
│           ├── index.ts      # SERVER-ONLY barrel: services, DAL
│           ├── actions.ts    # "use server" — Server Actions (thin)
│           ├── service.ts    # Business logic
│           └── repository.ts # Supabase queries; only place that knows table/column names
├── components/
│   ├── ui/                   # shadcn/ui primitives (+ index.ts barrel)
│   └── providers/            # Client providers (theme, toaster)
├── config/                   # site config, routes, env (validated with Zod)
├── lib/
│   ├── index.ts              # Isomorphic: errors, logger, createAction, cn
│   ├── api/                  # Route Handler helpers: withApi, json, parseBody
│   └── supabase/             # client.ts (browser) · server.ts · admin.ts (bypasses RLS) · proxy.ts
├── types/                    # Generated Supabase types (+ barrel)
└── proxy.ts                  # Session refresh + optimistic route guards (Next 16 "middleware")
supabase/                     # config.toml, migrations/, seed.sql
tests/                        # setup.ts, e2e/ (Playwright). Unit tests are colocated *.test.ts
```

## Request flow

```
Browser ─► proxy.ts ─ refresh session cookie, optimistic redirect
            │
            ├─► Page (Server Component) ─► <Suspense> ─► requireUser() ─► service ─► repository ─► Supabase (RLS)
            ├─► Server Action (createAction) ─► Zod ─► assertUser() ─► service ─► …
            └─► Route Handler (withApi)      ─► Zod ─► assertUser() ─► service ─► …
```

Services are the reuse point: the same `updateProfile` backs both the Server Action and `PATCH /api/v1/me`.

## Rendering model

`cacheComponents` and `partialPrefetching` are on. Consequences:

- Anything reading cookies/headers/searchParams (incl. Supabase server client) is request-time and **must render inside `<Suspense>`**.
- Never `await` the session at the top of a layout — it blocks the whole segment. Push it into a child component behind a boundary.
- Static UI (shells, marketing) prerenders automatically.
- See `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.

## Adding a feature

Use the `new-feature` skill (`.claude/skills/new-feature`). Checklist: migration + RLS → regenerate types → repository → service → schemas → actions / route → components → barrels → tests.

## Scaling notes

- Grow by adding feature modules, not by growing `lib/`. `lib/` is for cross-cutting infrastructure only.
- Features may import other features **only through their barrels**. If two features become tightly coupled, extract the shared part into a new feature rather than reaching into internals.
- API versioning: public/external HTTP APIs live under `/api/v1`. Breaking changes → `/api/v2`, keep v1 until consumers migrate.
- If the backend must be split out later, `features/*/server` is already the seam: services take plain inputs and return domain types.

# Several card providers at once, and Razorpay — Implementation Plan

> **Status: shipped** in #56.

Spec: `docs/superpowers/specs/2026-11-01-multi-provider-razorpay-design.md` (binding). Background: `docs/superpowers/specs/2026-10-31-stripe-card-handover-design.md`, `docs/adr/0013-card-handover-payment-providers.md`.

## Global Constraints

- Read `CLAUDE.md` hard rules. Feature modules, barrels, server/client barrels never mixed, layering route → service → repository, Zod on every input, `AppError` + `logger`, no `console.log`, Biome only.
- **Do not commit.** Leave all work uncommitted in the working tree. Do not stage with `git add` either.
- Unit tests live under `tests/`, mirroring `src/` (e.g. `tests/features/payments/server/service.test.ts`). Tests import by `@/…` path and mock with the same specifier.
- Money is integer minor units. Children never see payment state, providers or card details.
- Never read `.env*` files. Never print a credential. Placeholders only (`rzp_test_…`, `sk_test_…`).
- Razorpay is test mode only (`^rzp_test_`), INR only.
- Run `pnpm lint && pnpm typecheck && pnpm vitest run <paths>` for the files you touched before reporting. If the full suite OOMs, run Vitest with `--pool=forks --maxWorkers=2`.
- The controller already made these edits (keep them, build on them): `src/lib/payments/types.ts` (adds `"razorpay"`, `label`, `autoChargeSettleMinutes`), `src/lib/payments/stripe/index.ts` and `src/lib/payments/fake/index.ts` (`label`, `autoChargeSettleMinutes: 30`), `src/config/env.server.ts` (removes `PAYMENTS_PROVIDER`, adds `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`), `src/lib/payments/registry.ts` (multi-provider: `getPaymentProviders`, `paymentsEnabled`, `getPaymentProviderById`), `src/lib/payments/index.ts` barrel. Typecheck is red until Task 2 finishes; that is expected.

## Review Focus

Duplicate money posting, provider confusion (a payment, setup or auto charge handled by the wrong provider), open redirects in the Razorpay page and return route, secrets in code or logs, and children seeing payment data.

---

### Task 1: Migration — several providers, auto-charge provider

Spec §4. Use the `db-migration` skill. Files:
- Create `supabase/migrations/<timestamp>_payments_multi_provider.sql` via `pnpm db:migration payments_multi_provider`.
- Create `supabase/tests/database/payments_multi_provider.test.sql`; update existing pgTAP tests in `supabase/tests/database/payments*.test.sql` that call `due_auto_charges(text, …)` or `clear_auto_charge_by(uuid)`.
- Regenerate `src/types/database.types.ts` (`pnpm db:types`).

Steps:
- [ ] Write the pgTAP test first (spec §4.6); run `pnpm db:reset && pnpm db:test`, expect FAIL.
- [ ] Write the migration (spec §4.1–4.5). Check constraint names with `\d` / the original migration `20261031064410_payments.sql`; follow its comment style and `security definer set search_path = ''`. Re-apply the same `revoke`/`grant` as the originals for replaced functions (see the grants block near the end of `20261031064410_payments.sql`).
- [ ] `pnpm db:reset && pnpm db:test && pnpm db:types`. Expect PASS.
- [ ] Do not touch TypeScript beyond the generated types (Task 2 adapts the repository).

### Task 2: Registry, env and domain server code for several providers

Spec §3, §5, D1, D3, D4, D7. Files (expected; adjust as needed):
- `src/lib/payments/registry.ts` (already rewritten; fix if needed), `tests/lib/payments/registry.test.ts` (rewrite for D1: none on, stripe on, fake gates, stripe + fake both on, partial keys warn once without values, `getPaymentProviderById`).
- `tests/lib/payments/contract.test.ts`: each adapter declares its own test currency (fake GBP, stripe GBP).
- `src/features/payments/{types,schemas}.ts`, `src/features/payments/server/{service,repository,actions,auto-charge,fake-checkout,index}.ts`.
- `src/app/api/cron/payments/auto-charge/route.ts`, `src/app/dev/payments/fake/page.tsx`, and any page calling removed exports (`paymentsEnabled` stays exported from `@/features/payments/server`, now backed by the registry).
- Tests under `tests/features/payments/**` and `tests/app/api/**` for the changed behaviour.
- `.env.example` (remove `PAYMENTS_PROVIDER`, explain "on when keys set", add `RAZORPAY_*` placeholders), `playwright.config.ts` (drop `PAYMENTS_PROVIDER`).

Steps:
- [ ] Write failing tests: provider choice in `startCardPayment` (unknown/off provider → NOT_FOUND), D7 switching (other provider's live manual checkout is cancelled, same provider reused, auto in flight CONFLICT), `getCardPaymentState` shape (spec §5), `getSavedCards`, `getAutoChargeCard` per provider, `setAutoCharge`/`startCardSetup`/`removeSavedCard` with provider (remove calls `clear_auto_charge_by` with that provider only), `runAutoCharges` with two providers (each item charged by its own provider, `expires_at` from its `autoChargeSettleMinutes`), cron 404 when no provider, fake gates.
- [ ] Implement. Repository: `listDueAutoCharges(admin, providerIds, now, limit)` returns `provider`; `clearAutoChargeBy(admin, parentId, provider)`. Keep UI components compiling with the smallest prop changes; Task 3 owns the real UI.
- [ ] `pnpm lint && pnpm typecheck && pnpm vitest run tests/lib/payments tests/features/payments tests/app/api`. Expect PASS.

### Task 3: UI for several providers

Spec §6, D2, D3. Use the `ui-component` skill; `docs/design.md` is binding. Files (expected): `src/features/payments/components/{pay-by-card,auto-charge-toggle,saved-card-panel,payment-status-note}.tsx`, `src/features/payments/copy.ts`, the pages under `src/app/(app)/parent/**` that render them (handover, settings, allowance, gifts new/edit), their tests under `tests/features/payments/components/`, and `tests/e2e/payments.spec.ts` if a button name or flow changes.

Steps:
- [ ] Write failing component tests: one button per available provider, "Pay by card" with exactly one, "Pay with {label}" with several, unavailable reason when none; settings panel per provider with titles only when several; toggle picks the single saved card, asks when several saved, asks provider to save with when none and several on, names the card when on and several on.
- [ ] Implement.
- [ ] `pnpm check`; then `pnpm test:e2e tests/e2e/payments.spec.ts` (needs local Supabase; if it isn't running, say so in the report — never point tests at the hosted project in `.env.local`).

### Task 4: Razorpay adapter — pay now, customers, webhooks

Spec §7 (rows `minimumChargeMinor`, `ensureCustomer`, `createHostedPayment`, `parseWebhook`; webhook rows `payment_link.*`; failure mapping), D5. Files:
- Add the `razorpay` SDK (exact version pinned). Create `src/lib/payments/razorpay/{index,currencies,map-event}.ts`. `createHostedSetup`, `chargeSaved`, `detachMethod` throw `AppError("UNAVAILABLE", …)` with the standard copy for now (Task 5 replaces them).
- Register in `src/lib/payments/registry.ts` (between stripe and fake; keys `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; `checkoutUrl` per spec §7).
- Tests: `tests/lib/payments/razorpay/{index,map-event,currencies}.test.ts`, fixtures in `tests/lib/payments/razorpay/fixtures/*.json` (trimmed real-shape payloads), add razorpay (INR) to `tests/lib/payments/contract.test.ts`, registry test for razorpay on/off.

Steps:
- [ ] Write failing tests: request method/URL/body/auth header for `ensureCustomer` and `createHostedPayment` (card-only options, `reference_id`, `expire_by` in seconds, `callback_method: "get"`); 5xx/network/timeout → UNAVAILABLE; duplicate reference id → UNAVAILABLE; signature accept/reject/missing; missing event id → VALIDATION; live `public_key` → VALIDATION; `payment_link.paid/expired/cancelled` mapping; unknown event → null; failure-code table; `notes: []`.
- [ ] Implement.
- [ ] `pnpm lint && pnpm typecheck && pnpm vitest run tests/lib/payments`. Expect PASS.

### Task 5: Razorpay saved card and auto charge

Spec §7 (rows `createHostedSetup`, `chargeSaved`, `detachMethod`; webhook rows `order.paid`, `payment.captured`, `payment.failed`), §7.1, D4, D6. Files:
- `src/lib/payments/razorpay/{index,map-event}.ts` (replace Task 4's stubs).
- Page `src/app/(app)/parent/payments/razorpay/page.tsx`, client component `src/features/payments/components/razorpay-checkout.tsx` (export from the components barrel), params schema in `src/features/payments/schemas.ts`, a server helper exposing whether Razorpay is on and its key id (in `src/features/payments/server`, not reading `process.env`).
- Route `src/app/api/v1/payments/razorpay/return/route.ts` (`withApi`, Zod-parsed form).
- CSP/`next.config.ts` only if a policy exists that would block `checkout.razorpay.com`.
- Tests: adapter request shapes and mappings (`tests/lib/payments/razorpay/*`), params schema (accepts same-origin, rejects other origins, `//evil`, `javascript:`), return route (success → 303 success, no payment id → 303 cancel, bad URLs → 303 `/parent`, Razorpay off → 404), checkout component (opens Checkout with the spec's options; dismiss navigates to cancel).

Steps:
- [ ] Write failing tests.
- [ ] Implement.
- [ ] `pnpm check`. Expect PASS.

### Task 6: Security tooling and docs

Spec §8, §11. Files: `.gitleaks.toml`, `scripts/check-secrets.sh`, `.claude/hooks/extract-log.py` (redaction patterns for `rzp_test_…`/`rzp_live_…`), `docs/adr/0014-several-payment-providers-razorpay.md` (from `docs/adr/0000-template.md`), `docs/adr/0013-…md` status line, `docs/adr/README.md`, `docs/deploy.md`, `docs/api.md`, `docs/architecture.md`, `docs/database.md`, `docs/testing.md`, `docs/security.md`, `docs/fr-audit.md`, `docs/domain.md` if it names a single provider.

Steps:
- [ ] Add the secret patterns; prove each with a throwaway string piped through the scanner (do not write a real-looking key into a tracked file).
- [ ] Write the ADR and update docs. Remove every remaining `PAYMENTS_PROVIDER` mention outside `docs/superpowers/` and `.claude-logs/` (`grep -rn PAYMENTS_PROVIDER`).
- [ ] `pnpm check`. Expect PASS.

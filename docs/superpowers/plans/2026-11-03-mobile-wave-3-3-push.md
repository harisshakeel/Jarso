# Mobile wave 3, plan 3 of 4: native push (Android) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every notice pushed on the web today also buzzes the recipient's Android phone, a tap opens the matching phone screen, a child's notices from 21:00 to 07:00 family time wait until 07:00 and arrive as one summary, and the sweep runs every 15 minutes.

**Architecture:** Phones register Expo push tokens in a new `device_push_tokens` table through bearer `/api/v1/push/tokens`. The existing at-most-once dispatcher (`claim_unpushed_notifications` → `dispatchPush`) sends each claimed notice to both transports (web push, Expo Push API), each gated on its own config; the claim skips a child's notices while it is 21:00–07:00 in the family's timezone, and at 07:00 dispatch sends a child's overnight notices as one summary push (a single one as itself). Expo tickets are stored and their receipts checked on the next sweep, which pg_cron + pg_net now fires every 15 minutes. The phone gets a development build (expo-dev-client), `expo-notifications`, a permission prompt, register after sign-in, unregister before sign-out, and a tap router for both roles.

**Tech Stack:** Postgres (pg_cron, pg_net, Vault), pgTAP, Next.js 16 Route Handlers, Vitest, Expo SDK 58 (`expo-notifications`, `expo-device`, `expo-dev-client`), EAS Build, jest-expo + RNTL, Maestro.

**Spec:** `docs/superpowers/specs/2026-11-03-mobile-wave-3-design.md` (Goals 3, 4; Decided §5 Push, §6 Builds; §3 rows `POST /push/tokens`, `DELETE /push/tokens`; push items in "Done when"). Read with ADR 0012, 0016, 0017.

## Global Constraints

- Android only: no iOS config, `platform` is `'android'` only.
- Quiet hours (user's revised rule): `claim_unpushed_notifications` does not claim a child's notice while `now()`, in `families.timezone`, is in [21:00, 07:00); it stays unpushed and the first sweep at or after 07:00 claims it. Parents are never held. A claimed child notice is `overnight` when its `created_at` is in [21:00, 07:00) family time. Two or more `overnight` notices for one recipient in a batch → ONE summary push (routed to News, every notice left unread, all marked `pushed_at`); a single one is pushed as itself. Applies to both transports.
- Delivery state stays `notifications.pushed_at` only, at most once per notice across both transports (ADR 0012).
- Each transport is gated on its own config: web push on VAPID keys (unchanged), Expo on `EXPO_PUSH` (`on` default). Claiming runs when either is on.
- Expo send: `https://exp.host/--/api/v2/push/send`, batches of 100. Receipts: `https://exp.host/--/api/v2/push/getReceipts`. `DeviceNotRegistered` on a ticket or receipt deletes the token.
- At most 10 tokens per member; a token moves to whichever account registers it.
- No secret in the repo or bundle: FCM v1 service-account key lives only in EAS credentials; `google-services.json` only as an EAS file env var (`GOOGLE_SERVICES_JSON`), git-ignored. No Expo access token is added.
- Never log a token, an endpoint, a recipient id or notice text (logs are public).
- Migrations: written here, verified by pgTAP in PR CI (no local Docker unless the user approves). **Ask the user before `supabase db push --linked`** (Task 5). Types via `pnpm db:types:linked` after the push.
- Phone: env read only in `src/config/env.ts`; `console.log` banned; copy from `@jarso/core`.
- Cross-plan: plan 2 provides `registerBeforeSignOut(fn: () => Promise<void>): () => void` from `apps/mobile/src/features/auth`, a session `status` of `"child" | "parent"` with `userId`, and the parent routes `app/(parent)/(tabs)/{index,children,jarso,inbox}`, `app/(parent)/children/[childId]/{index,history}`, `app/(parent)/children/[childId]/handover/[kind]/[id]`. Tasks 10–13 need plan 2 merged (typed routes). Plan 2 owns calling `dispatchNotices()` after parent mutations.
- `pnpm check` green after every task. Commits: Conventional Commits, subject ≤ 60 chars, no AI attribution, one logical change each. **Commit steps run only after the user says to commit.**

## Review Focus

1. **Sign-out with no network.** `DELETE /push/tokens` fails, the row stays on the old account, and their notices keep buzzing the phone. Expected: the phone also drops its FCM registration so sends fail as `DeviceNotRegistered` and the row is cleaned. *(Task 11 test: `unregister falls back to unregisterForNotificationsAsync when DELETE fails`)*
2. **Tap that launches the app, or a push meant for the previous account.** Expected: wait for the session, navigate once; a push whose `recipientId` is not the signed-in user opens that user's Home and marks nothing read. *(Task 12 tests: `cold start waits for the session then navigates once`, `push for another recipient opens role home`)*
3. **A morning batch that is mostly summarised.** If summarised notices were not counted as claimed, `drainPush` would see a short batch and stop with notices left. Expected: every notice a summary covers counts toward the batch. *(Task 8 test: `a summary counts its notices toward a full batch`)*
4. **Expo down, slow or 5xx.** Expected: web push still goes, dispatch never throws, failures counted by status only. *(Task 7 test: `a failed chunk becomes error tickets and never throws`; Task 8 test: `expo failure does not stop web push`)*
5. **Timezone and DST edges.** Expected: 06:59 local is quiet, 07:00 is not, 20:59 is not, 21:00 is, also on a DST change day in a non-UTC family. *(Task 3 pgTAP: `06:59 BST on the spring-forward day is quiet` and its neighbours)*

---

## File Structure

```
apps/mobile/eas.json, app.json, app.config.ts, package.json      MODIFY dev build, notifications plugin, POST_NOTIFICATIONS, googleServicesFile
.gitignore                                                       MODIFY google-services.json, firebase admin keys
supabase/migrations/<ts>_device_push_tokens.sql                  NEW  tokens + tickets tables, RLS, register/unregister/for RPCs
supabase/migrations/<ts>_push_quiet_hours.sql                    NEW  is_child_quiet_hour, claim skips children at night, returns overnight
supabase/migrations/<ts>_push_sweep_cron.sql                     NEW  trigger_push_sweep + pg_cron every 15 min
supabase/tests/database/{device_push_tokens,push_quiet_hours,push_sweep_cron}.test.sql  NEW
packages/db/src/database.types.ts                                REGEN
packages/core/src/notifications/{push.ts,schemas.ts,types.ts,copy.ts,index.ts}   NEW/MODIFY PushData (notice | summary), schemas, PushResult.summarised, prompt + summary copy
apps/web/src/config/env.server.ts, .env.example                  MODIFY EXPO_PUSH
apps/web/src/features/notifications/server/{expo-push.ts,push.ts,repository.ts,service.ts,index.ts}  NEW/MODIFY
apps/web/src/app/api/cron/push/route.ts                          MODIFY POST, receipts
apps/web/src/app/api/v1/push/tokens/route.ts                     NEW  POST, DELETE (bearer)
apps/web/src/app/api/v1/notices/dispatch/route.ts                MODIFY any-transport gate
apps/web/vercel.json                                             MODIFY drop push cron
apps/mobile/src/features/push/{channel,register,use-push-registration,use-push-taps,foreground,index}.ts(x)  NEW
apps/mobile/app/_layout.tsx                                      MODIFY mount <PushBridge/>
apps/mobile/e2e/{push.yaml,scripts/child-asks.js}                NEW
docs/{mobile,api,database,security,testing}.md, docs/adr/0012-web-push.md, docs/adr/0016-mobile-direct-supabase.md  MODIFY
```

---

### Task 1: Development build profile (plan 4 depends on this)

**Files:**
- Modify: `apps/mobile/eas.json`, `apps/mobile/app.json`, `apps/mobile/app.config.ts`, `apps/mobile/package.json`, `.gitignore`, `docs/mobile.md` ("Run it", "Device e2e"), `docs/security.md` (where FCM credentials live)
- Test: `apps/mobile/tests/app-config.test.ts`

**Interfaces:**
- Produces: EAS profile `development` (`extends: "base"`, `developmentClient: true`, `distribution: "internal"`, `environment: "development"`, `android.buildType: "apk"`); dependency `expo-dev-client`; `pnpm mobile` runs `expo start --dev-client`. Plan 4 adds `@stripe/stripe-react-native` and `react-native-razorpay` plugins on top of this; nothing here is payments-specific.
- Produces: `app.json` plugin `["expo-notifications", { "color": "#02627d", "defaultChannel": "notices" }]`, `android.permissions: ["POST_NOTIFICATIONS"]`; deps `expo-notifications`, `expo-device` (`npx expo install`, SDK 58 versions).
- Produces: `app.config.ts` sets `android.googleServicesFile` to `process.env.GOOGLE_SERVICES_JSON` only when it is set (EAS file env var; a local dev build without it still builds, it just gets no push token).

- [ ] **Step 1: Write the failing test** `apps/mobile/tests/app-config.test.ts`:
  - `development profile is a dev-client apk`: `eas.build.development` has `developmentClient === true`, `android.buildType === "apk"`, `extends === "base"`.
  - `notifications plugin and permission`: app.json plugins contain an `expo-notifications` entry; `android.permissions` contains `"POST_NOTIFICATIONS"`.
  - `googleServicesFile comes only from the EAS file var`: with `process.env.GOOGLE_SERVICES_JSON = "/tmp/gs.json"` the config's `android.googleServicesFile === "/tmp/gs.json"`; unset → `undefined`.
  - `cleartext stays off for production`: existing behaviour, `EAS_BUILD_PROFILE=production` → `usesCleartextTraffic: false`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/mobile test app-config`. Expected: FAIL.
- [ ] **Step 3:** Implement the config and install the three packages; add `apps/mobile/google-services.json` and `*firebase-adminsdk*.json` to `.gitignore`.
- [ ] **Step 4:** Docs. `docs/mobile.md`: Expo Go no longer runs the app; build once with `eas build --profile development --platform android` (or `npx expo run:android`), install the APK, then `pnpm mobile`; rebuild only when a native module or plugin changes. FCM setup: `eas credentials` → Android → upload the FCM v1 service-account key; `eas env:create --name GOOGLE_SERVICES_JSON --type file --visibility sensitive --environment development` (and preview, production). `docs/security.md`: secrets table rows for the FCM key (EAS only) and `google-services.json` (EAS file var, git-ignored; its `AIza…` key is already blocked by `check-secrets.sh`).
- [ ] **Step 5:** Run `pnpm check` and `cd apps/mobile && npx expo config --type public > /dev/null` (config resolves), then `npx expo export --platform android` and delete `dist/`. Expected: green; export succeeds.
- [ ] **Step 6: Commit** (when authorised): `build(mobile): add development build and notifications plugin`

---

### Task 2: `device_push_tokens` migration

**Files:**
- Create: `supabase/migrations/<ts>_device_push_tokens.sql` (via `pnpm db:migration device_push_tokens`)
- Create: `supabase/tests/database/device_push_tokens.test.sql`
- Modify: `docs/database.md` (Current schema rows + functions), `docs/testing.md` (pgTAP file list)

**Interfaces:**
- Produces table `public.device_push_tokens`: `id uuid pk default gen_random_uuid()`, `profile_id uuid not null references profiles(id) on delete cascade` (house naming, the spec's `user_id`), `token text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$')`, `platform text not null check (platform = 'android')`, `created_at timestamptz not null default now()`, `last_seen_at timestamptz not null default clock_timestamp()`; index on `profile_id`. RLS on; `revoke all from anon, authenticated; grant select to authenticated`; one policy `"Device push tokens are the owner's"` (select, `profile_id = (select auth.uid())`).
- Produces table `public.device_push_tickets`: `id text pk check (char_length(id) between 1 and 100)` (Expo ticket id), `token_id uuid not null references device_push_tokens(id) on delete cascade`, `created_at timestamptz not null default now()`; index on `created_at`. RLS on, no policies, `revoke all from anon, authenticated` (admin client only).
- Produces RPCs (security definer, `set search_path = ''`, same shape as `push_subscribe` / `push_unsubscribe`):
  - `register_device_push_token(p_token text, p_platform text) returns uuid` — `authenticated`; `42501 'Join a family first'` unless approved member; deletes the token from any other profile, upserts (`on conflict (token)` refreshes `platform`, `last_seen_at = clock_timestamp()`), keeps the caller's newest 10 by `last_seen_at`.
  - `unregister_device_push_token(p_token text) returns boolean` — `authenticated`; deletes only the caller's row.
  - `device_push_tokens_for(p_recipient_ids uuid[]) returns table (id uuid, profile_id uuid, token text)` — `service_role` only.

- [ ] **Step 1: Write the pgTAP file** (`begin; \ir _helpers.psql; select plan(n);` … `finish(); rollback;`, fixtures as in `push.test.sql`: parents pa, pb, child c1, outsider nobody). Assertions:
  - `has_table` for both tables; `relrowsecurity` true for both; `policies_are('public','device_push_tokens', array['Device push tokens are the owner''s'])`; `policies_are('public','device_push_tickets', array[]::text[])`.
  - `throws_ok` as nobody → `'42501'`, `'an outsider cannot register a token'`.
  - pa registers `ExponentPushToken[aaa]` → `lives_ok`; pa sees 1 row; registering it again keeps 1 row and `last_seen_at` increases.
  - `throws_ok(... 'not-a-token' ...)` → `'23514'`; platform `'ios'` → `'23514'`.
  - 12 more tokens for pa → `count = 10`, `ExponentPushToken[aaa]` gone (oldest dropped).
  - c1 registers a token pa holds → c1 sees it; as pa `count(*) where token = …` = 0 (`'a token moves to the account that registers it'`).
  - As pa, `count(*) from device_push_tokens where profile_id = c1` = 0 (RLS).
  - As pa, `throws_ok('insert into public.device_push_tokens …', '42501')` (no direct writes).
  - pa `unregister_device_push_token(<c1's token>)` → false and c1's row remains; c1 unregisters own → true.
  - `not has_function_privilege('anon', 'public.register_device_push_token(text, text)', 'execute')`; `not has_function_privilege('authenticated', 'public.device_push_tokens_for(uuid[])', 'execute')`.
  - As `service_role`: `device_push_tokens_for(array[pa])` returns exactly pa's 10 rows.
  - `not has_table_privilege('authenticated', 'public.device_push_tickets', 'select')`; inserting a ticket for a token then deleting the token leaves 0 tickets (cascade).
- [ ] **Step 2: Write the migration** to the Interfaces above; header comment says why a separate table (web-push shape and tests untouched) and the takeover rule.
- [ ] **Step 3:** Run `pnpm --filter @jarso/web typecheck` (nothing references the new SQL yet) and `pnpm exec supabase db lint` if the user has approved local Docker; otherwise note that pgTAP runs in the PR's `migrations` job. Expected: green / deferred to CI.
- [ ] **Step 4:** Update `docs/database.md` (table rows, the three functions, tickets table) and the pgTAP list in `docs/testing.md`.
- [ ] **Step 5: Commit** (when authorised): `feat(db): device push tokens for the phone`

---

### Task 3: quiet hours in the push claim

**Files:**
- Create: `supabase/migrations/<ts>_push_quiet_hours.sql`
- Create: `supabase/tests/database/push_quiet_hours.test.sql`
- Modify: `docs/database.md` (`claim_unpushed_notifications` line)

**Interfaces:**
- Produces `public.is_child_quiet_hour(p_at timestamptz, p_timezone text) returns boolean` (`language sql stable`, `set search_path = ''`, execute revoked from public, anon, authenticated). Body, pinned by the spec:

```sql
select (p_at at time zone p_timezone)::time >= time '21:00'
    or (p_at at time zone p_timezone)::time <  time '07:00';
```

- Produces `claim_unpushed_notifications(p_limit integer default 50, p_now timestamptz default now())` (`p_now` lets pgTAP pick the clock; the dispatcher never passes it) with one more output column, last: `overnight boolean`. Signature and return type change, so `drop function public.claim_unpushed_notifications(integer);` then recreate with the same body and grants (service_role only), with `now()` replaced by `p_now` (the `pushed_at` stamp and the one-day window) and two additions:

```sql
-- in the candidate subquery: a child is not claimed during their family's night
and not exists (
  select 1 from public.family_members q
  join public.families qf on qf.id = u.family_id
  where q.profile_id = u.recipient_id and q.family_id = u.family_id
    and q.role = 'child' and public.is_child_quiet_hour(p_now, qf.timezone)
)
-- in the final select
coalesce(m.role = 'child' and public.is_child_quiet_hour(c.created_at, f.timezone), false) as overnight
```

  One-day window checked: the oldest held notice (created at 21:00) is claimed at 07:00, 10 h later (11 h across a DST fall-back), well inside `interval '1 day'`, so the window stays as is.

- [ ] **Step 1: Write the pgTAP file.** Assertions:
  - `is_child_quiet_hour` cases in `'Asia/Kolkata'`: `'2026-11-03 16:30+00'` (22:00 IST) true; `'2026-11-03 15:29+00'` (20:59) false; `'2026-11-03 15:30+00'` (21:00) true; `'2026-11-03 01:29+00'` (06:59) true; `'2026-11-03 01:30+00'` (07:00) false.
  - DST, `'Europe/London'`, spring-forward day: `'2026-03-29 05:59+00'` (06:59 BST) → true as `'06:59 BST on the spring-forward day is quiet'`; `'2026-03-29 06:00+00'` (07:00 BST) false.
  - Family in `'Asia/Kolkata'` with parent pa and child c1. Let `t22` = the most recent 22:00 IST at or before `now()`; insert one notice for c1 and one for pa with `created_at = t22`. As service_role:
    - `claim_unpushed_notifications(10, t22 + interval '30 minutes')` returns only pa's row, `overnight` false (`'a parent at 22:00 is claimed'`); c1's row still has `pushed_at is null` (`'a child notice at 22:00 is not claimed at 22:30'`).
    - `claim_unpushed_notifications(10, t22 + interval '8 hours 59 minutes')` (06:59 IST) returns 0 rows.
    - `claim_unpushed_notifications(10, t22 + interval '9 hours')` (07:00 IST) returns c1's row with `overnight` true (`'a child notice at 22:00 is claimed at 07:00'`); it now has `pushed_at` set and `read_at is null`.
  - A child notice created at 15:00 IST and claimed at 15:05 IST is returned with `overnight` false.
  - `not has_function_privilege('authenticated', 'public.claim_unpushed_notifications(integer, timestamptz)', 'execute')` after the drop/recreate.
- [ ] **Step 2: Write the migration.**
- [ ] **Step 3:** Fix `supabase/tests/database/push.test.sql` for the new signature (its function-privilege checks name `(integer)`; its family is `'UTC'`, so pass `p_now` at midday UTC to its claims or a CI run at night would skip its child rows). pgTAP runs in PR CI.
- [ ] **Step 4:** Update `docs/database.md`.
- [ ] **Step 5: Commit** (when authorised): `feat(db): hold child pushes until 07:00`

---

### Task 4: push sweep every 15 minutes through pg_cron

**Files:**
- Create: `supabase/migrations/<ts>_push_sweep_cron.sql`
- Create: `supabase/tests/database/push_sweep_cron.test.sql`
- Modify: `apps/web/src/app/api/cron/push/route.ts` (export `POST` as well as `GET`, comment), `apps/web/vercel.json` (remove the `/api/cron/push` entry), `docs/api.md` (cron table row and §), `docs/adr/0016-mobile-direct-supabase.md` (last consequence: "15-minute sweep")
- Test: `apps/web/tests/app/api/cron/push/route.test.ts`

**Interfaces:**
- Produces `public.trigger_push_sweep() returns void` — copy of `trigger_auto_charge()` (`20261031072658_payments_notify_expired_auto.sql`): Vault `app_url` + `cron_secret`, quiet return when Vault, pg_net or a secret is missing, `net.http_post` to `<app_url>/api/cron/push`, `timeout_milliseconds := 30000`; no grants.
- Produces pg_cron job `'push-sweep'`, schedule `'*/15 * * * *'`, command `select public.trigger_push_sweep()`, inside the `pg_available_extensions` guard used by `charge-due-cards`.
- Route: `GET` and `POST` share one handler (`const handler = withApi(...)`), as `/api/cron/payments/auto-charge` does.

- [ ] **Step 1: Write the pgTAP file**, mirroring `payments_auto_charge_cron.test.sql`: `has_function`, `is_definer`, no execute for authenticated and anon, `cron.job` row `jobname = 'push-sweep' and schedule = '*/15 * * * *'`, `lives_ok` with secrets absent, and with placeholder secrets exactly one queued `POST` to `'http://app.test/api/cron/push'` with `Authorization = 'Bearer placeholder-cron-secret-0000'` and `timeout_milliseconds = 30000`, and nothing else.
- [ ] **Step 2:** Add to the route test: `POST with the secret drains` (same expectations as the existing GET case) and `POST with a wrong secret is 401`.
- [ ] **Step 3:** Run `pnpm --filter @jarso/web test cron/push`. Expected: FAIL (no POST export).
- [ ] **Step 4:** Implement the migration, the route export and the `vercel.json` removal; update the docs.
- [ ] **Step 5:** Run `pnpm check`. Expected: green.
- [ ] **Step 6: Commit** (when authorised): `feat(push): sweep every 15 minutes from pg_cron`

---

### Task 5: push the migrations and regenerate types

No code. Tasks 8 and 9 need the regenerated types; if the user defers the push, stop here and resume later.

- [ ] **Step 1:** `pnpm exec supabase migration list --linked`. Expected: the three new migrations listed as local only.
- [ ] **Step 2:** `pnpm exec supabase db push --linked --dry-run`. Expected: exactly the three files.
- [ ] **Step 3: Ask the user** to approve `supabase db push --linked` (it is production). Mention that `trigger_push_sweep` needs the Vault `app_url` and `cron_secret` that `charge-due-cards` already uses, and that the Vercel push cron is removed in the same deploy.
- [ ] **Step 4:** After approval, `pnpm db:push`, then `pnpm db:types:linked`. Expected: `packages/db/src/database.types.ts` gains `device_push_tokens`, `device_push_tickets`, the three token RPCs, `is_child_quiet_hour`, the claim's `p_now` and `overnight`, `trigger_push_sweep`.
- [ ] **Step 5:** Run `pnpm check`. Expected: green.
- [ ] **Step 6: Commit** (when authorised): `chore(db): regenerate types for device push`

---

### Task 6: core push payload, schemas and prompt copy

**Files:**
- Create: `packages/core/src/notifications/push.ts`
- Modify: `packages/core/src/notifications/{types.ts,schemas.ts,copy.ts,index.ts}`
- Test: `packages/core/tests/notifications/push.test.ts`

**Interfaces:**
- `types.ts`: `ClaimedNotice` gains `overnight: boolean`. `PushResult = { claimed: number; sent: number; dropped: number; failed: number; summarised: number }` (`summarised` = notices covered by a summary push). New `DevicePushTokenInput = { token: string; platform: "android" }`, `DeviceTokenRow = { id: string; profileId: string; token: string }`.
- `push.ts`: `type PushData = { kind: "notice"; noticeId: string; recipientId: string; role: NoticeRole; target: NoticeTarget } | { kind: "summary"; recipientId: string; role: "child"; count: number }`; `pushData(claimed: ClaimedNotice): PushData` (kind `notice`, target from `noticeTarget(claimed.notice, claimed.role)`); `summaryPushData(recipientId: string, count: number): PushData`; `summaryPushText(count: number): { title: string; detail: string }` from `summaryPushCopy`.
- `planPushes(batch: ClaimedNotice[]): PushPlan[]` where `PushPlan = { kind: "notice"; claimed: ClaimedNotice } | { kind: "summary"; recipientId: string; currency: string; notices: ClaimedNotice[] }`: groups `overnight` notices by recipient; two or more → one `summary` plan; one → a `notice` plan; non-overnight → `notice` plans, order kept. Pure, in core so it is tested once.
- `schemas.ts`: `EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/`; `devicePushTokenSchema = z.object({ token: z.string().regex(EXPO_PUSH_TOKEN), platform: z.literal("android") })`; `devicePushTokenDeleteSchema = z.object({ token: z.string().regex(EXPO_PUSH_TOKEN) })`; `noticeTargetSchema` (discriminated union on `to`, ids `z.uuid()`, `kind: z.enum(["allowance","gift"])`); `pushDataSchema` = discriminated union on `kind`: `notice` `{ noticeId: z.uuid(), recipientId: z.uuid(), role: z.enum(["parent","child"]), target: noticeTargetSchema }`, `summary` `{ recipientId: z.uuid(), role: z.literal("child"), count: z.int().min(2) }`.
- `copy.ts`: `pushPromptCopy` (exact strings, `docs/design.md` voice):
  - `title: "Get a ping from Jarso?"`
  - `child: "We'll tell you when money arrives or a parent answers. Never late at night."`
  - `parent: "We'll tell you when your child asks for something or a handover is due."`
  - `allow: "Turn on"`, `later: "Not now"`
- `copy.ts`: `summaryPushCopy = { title: (count: number) => \`You have ${count} new notices\`, detail: "They came in overnight. Open News to see them." }` (count is always ≥ 2).

- [ ] **Step 1: Write the failing tests:** `planPushes sends two overnight notices for one child as one summary`; `planPushes sends a single overnight notice as itself`; `planPushes keeps non-overnight and parent notices as their own pushes`; `planPushes summarises per recipient` (two children, 2 + 1 overnight → one summary + one notice); `summaryPushText(3).title is 'You have 3 new notices'`; `pushData carries the parent handover target` (payment/allowance notice for a parent → `{ to: "handover", childId, kind: "allowance", id }`, `recipientId`, `noticeId`); `pushData for a child ledger notice targets diary`; `pushDataSchema accepts what pushData builds` (round trip for every `NoticeTarget` variant); `pushDataSchema rejects an unknown target and a non-uuid id`; `devicePushTokenSchema accepts ExponentPushToken[...] and ExpoPushToken[...], rejects 'abc' and platform 'ios'`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/core test notifications/push`. Expected: FAIL.
- [ ] **Step 3:** Implement; export from the barrel. Update `toClaimed` in `apps/web/src/features/notifications/server/repository.ts` (`ClaimedRow.overnight: boolean | null` → `overnight: row.overnight === true`) and the `PushResult` initialisers in `push.ts` (`summarised: 0`) so the web typechecks.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5: Commit** (when authorised): `feat(notifications): push payload and token schemas in core`

---

### Task 7: Expo Push API client

**Files:**
- Create: `apps/web/src/features/notifications/server/expo-push.ts` (`import "server-only"`)
- Test: `apps/web/tests/features/notifications/server/expo-push.test.ts`

**Interfaces:**
- `type ExpoMessage = { to: string; title: string; body: string; data: PushData; channelId: "notices"; ttl: 3600; priority: "high" }`
- `type ExpoTicket = { status: "ok"; id: string } | { status: "error"; error: string }` (`error` from `details.error`, else `"Unknown"`; a transport failure is `"Transport"`).
- `sendExpoMessages(messages: ExpoMessage[], fetchImpl?: typeof fetch): Promise<ExpoTicket[]>` — one ticket per message, in order; chunks of 100 posted one after another, `Content-Type`/`Accept: application/json`, 10 s timeout each (`createTimedFetch` from `@/lib` or `AbortController`); a chunk that throws, times out, answers non-2xx or returns a `data` array of the wrong length yields `"Transport"` tickets for that chunk. Never throws.
- `fetchExpoReceipts(ids: string[], fetchImpl?: typeof fetch): Promise<Map<string, { status: "ok" } | { status: "error"; error: string }>>` — chunks of 1000; a failed chunk yields no entries. Never throws.
- `expoSummaryMessage(recipientId: string, count: number, token: string): ExpoMessage` — `summaryPushText(count)` and `summaryPushData(recipientId, count)` (Task 6).
- `expoMessage(claimed: ClaimedNotice, token: string): ExpoMessage` — `title`/`body` from `noticeText(claimed.notice, claimed.role, claimed.currency)` (same words as `pushPayload`), `data: pushData(claimed)`.

- [ ] **Step 1: Write the failing tests** with a fetch stub: `posts 250 messages as chunks of 100, 100, 50`; `maps ok and DeviceNotRegistered tickets in order`; `a failed chunk becomes error tickets and never throws` (reject, 503, wrong length); `receipts are fetched in chunks of 1000 and keyed by id`; `expoMessage uses the inbox row's words and pushData`; `logs never contain a token or notice text` (spy on logger).
- [ ] **Step 2:** Run `pnpm --filter @jarso/web test expo-push`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** (when authorised): `feat(push): Expo Push API client`

---

### Task 8: dispatch to both transports, overnight summary, receipts

**Files:**
- Modify: `apps/web/src/features/notifications/server/{push.ts,repository.ts,index.ts}`, `apps/web/src/app/api/cron/push/route.ts`, `apps/web/src/app/api/v1/notices/dispatch/route.ts`, `apps/web/src/config/env.server.ts`, `.env.example`
- Modify: `docs/adr/0012-web-push.md` (amendment section), `docs/api.md` (dispatch and cron rows)
- Test: `apps/web/tests/features/notifications/server/push.test.ts`, `apps/web/tests/app/api/cron/push/route.test.ts`, `apps/web/tests/app/api/v1/notices-dispatch.test.ts`

**Interfaces:**
- Consumes: Task 7 `sendExpoMessages`, `fetchExpoReceipts`, `expoMessage`; Task 6 `ClaimedNotice.overnight`, `planPushes`, `summaryPushData`, `summaryPushText`, `PushResult.summarised`; Task 2 RPCs.
- `env.server.ts`: `EXPO_PUSH: blankAsUnset(z.enum(["on", "off"]).default("on"))` with a one-line comment (phone push kill switch; no secret).
- `push.ts`: `isWebPushConfigured(): boolean` (today's VAPID check, renamed); `isExpoPushConfigured(): boolean` (`serverEnv.EXPO_PUSH !== "off"`); `isPushConfigured(): boolean` = either. `dispatchPush(limit = 50): Promise<PushResult>`: returns zeros unless `isPushConfigured()`; claims; `planPushes(batch)`; a `summary` plan is one push per transport target with `summaryPushText` / `summaryPushData` (web push `url: routes.childInbox`, tag `summary:<recipientId>`; Expo `data` kind `summary`), adds its notice count to `summarised`, marks nothing read; a `notice` plan is today's single push; web transport only when `isWebPushConfigured()` (unchanged behaviour); Expo only when `isExpoPushConfigured()`: `deviceTokensFor` → one message per (notice, token) → tickets; `ok` → `recordExpoTickets`, `sent += 1`; `DeviceNotRegistered` → `deleteDeviceTokenById`, `dropped += 1`; other → `failed += 1`, `logger.warn("Expo push failed", { error })`. `drainPush` adds `summarised`; `claimed` still counts every claimed row, so the batch-full check holds. New `checkExpoReceipts(): Promise<{ checked: number; dropped: number }>`: `takeDueExpoTickets` → `fetchExpoReceipts` → `DeviceNotRegistered` receipts delete their token → `deleteExpoTickets(all taken ids)`.
- `repository.ts` (admin, server only): `deviceTokensFor(admin, recipientIds: string[]): Promise<DeviceTokenRow[]>`; `deleteDeviceTokenById(admin, id: string): Promise<void>`; `recordExpoTickets(admin, rows: { id: string; tokenId: string }[]): Promise<void>`; `takeDueExpoTickets(admin, limit = 1000): Promise<{ id: string; tokenId: string }[]>` (`created_at < now() - 15 minutes`, oldest first); `deleteExpoTickets(admin, ids: string[]): Promise<void>`.
- Cron route returns `{ ...PushResult, receipts: { checked, dropped } }`; receipts run after `drainPush`, within the same budget, and a receipts failure is logged and does not fail the sweep.
- Dispatch route: gate on `isPushConfigured()` (now any transport).

- [ ] **Step 1: Write the failing tests** (extend the existing mocks with the new repo functions and an `expo-push` mock):
  - `isWebPushConfigured needs both keys` (renamed existing test); `isPushConfigured is true with VAPID unset while EXPO_PUSH is on`; `claims nothing when both transports are off`.
  - `sends each claimed notice to the recipient's web subscriptions and phone tokens only`.
  - `three overnight notices for one child send one summary push per subscription and token, titled 'You have 3 new notices', summarised: 3`.
  - `one overnight notice is pushed as itself`; `parent notices are never summarised`.
  - `the summary's web payload opens /child/inbox and its Expo data is kind summary`.
  - `a summary counts its notices toward a full batch` (first claim returns 200 overnight rows for 2 children, second returns 0 → two claims, `claimed: 200`, `summarised: 200`).
  - `DeviceNotRegistered ticket deletes the token and counts dropped`; `ok tickets are recorded with their token id`.
  - `expo failure does not stop web push` (all `"Transport"` tickets; web `sent` unchanged; no throw).
  - `web push only when VAPID is set, Expo only when EXPO_PUSH is on` (two cases).
  - `checkExpoReceipts deletes tokens with DeviceNotRegistered receipts and deletes every taken ticket`.
  - Cron route: `returns the drain result with receipts`; `a receipts failure still returns 200 with the drain result`.
  - Dispatch route: `queues with VAPID unset when Expo is on`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/web test notifications cron/push notices-dispatch`. Expected: FAIL.
- [ ] **Step 3:** Implement; export `checkExpoReceipts`, `isWebPushConfigured` from `server/index.ts`. Add `EXPO_PUSH=on` (commented) to `.env.example`.
- [ ] **Step 4:** ADR 0012: add "## Amendment (2026-11-03, mobile wave 3)": phones are a second transport (`device_push_tokens`, Expo Push API, tickets + receipts), each transport gated on its own config, child quiet hours: a child's notices are not claimed while it is 21:00–07:00 family time; at 07:00 two or more `overnight` notices for one child go as one summary push to News (single ones as themselves, all left unread), the sweep moves to pg_cron every 15 minutes; `pushed_at` stays the only delivery state. Status line: "Accepted; amended 2026-11-03". `docs/api.md`: dispatch row says "web and phone push".
- [ ] **Step 5:** Run `pnpm check`. Expected: green.
- [ ] **Step 6: Commit** (when authorised): `feat(push): send notices to phones through Expo`

---

### Task 9: `POST` / `DELETE /api/v1/push/tokens`

**Files:**
- Create: `apps/web/src/app/api/v1/push/tokens/route.ts`
- Modify: `apps/web/src/features/notifications/server/{service.ts,repository.ts,index.ts}`, `docs/api.md`
- Test: `apps/web/tests/app/api/v1/push-tokens.test.ts` (uses `fake-bearer-scope.ts`), `apps/web/tests/features/notifications/server/service.test.ts` (or the existing service test file)

**Interfaces:**
- Consumes: Task 6 `devicePushTokenSchema`, `devicePushTokenDeleteSchema`, `DevicePushTokenInput`; Task 2 RPCs.
- `repository.ts`: `saveDeviceToken(db, input: DevicePushTokenInput): Promise<string>` (`register_device_push_token`); `removeDeviceToken(db, token: string): Promise<boolean>` (`unregister_device_push_token`). `42501` maps through `toAppError` as today.
- `service.ts`: `registerDeviceToken(input: DevicePushTokenInput): Promise<{ id: string }>` and `unregisterDeviceToken(token: string): Promise<{ removed: boolean }>`, each `await assertUser()` then `createClient()` (the bearer scope's client).
- Route: `POST` → `parseBody(request, devicePushTokenSchema)` → `json(await registerDeviceToken(body), { status: 201 })`; `DELETE` → `parseBody(request, devicePushTokenDeleteSchema)` → `json(await unregisterDeviceToken(body.token))`; both `withApi(handler, { bearer: true })`, request as the first argument. Any approved member, parent or child.

- [ ] **Step 1:** Run the `security-auditor` agent on this Interfaces block plus Task 2's RPC rules. Fold blocking findings into the steps.
- [ ] **Step 2: Write the failing tests:** `POST with a child bearer registers and returns 201 { data: { id } }`; `POST with a parent bearer registers`; `POST with a bad token is 400 and never calls the RPC`; `POST without a bearer or cookie is 401`; `DELETE returns { removed }` (true and false cases); `RPC 42501 (not a member) is 403 with a safe message`; `the token never appears in logs`.
- [ ] **Step 3:** Run `pnpm --filter @jarso/web test push-tokens`. Expected: FAIL.
- [ ] **Step 4:** Implement; add both rows to `docs/api.md` (auth: user, bearer).
- [ ] **Step 5:** Run `pnpm check`. Expected: green.
- [ ] **Step 6: Commit** (when authorised): `feat(api): register and unregister phone push tokens`

---

### Task 10: notice target routes for both roles (phone) — provided by plan 2

No work here. Plan 2 Task 3b already ships `noticeTargetRoute(target: NoticeTarget, role: NoticeRole): Href` and `useOpenNotice(role)` in `apps/mobile/src/features/news` (exported from its barrel), because the parent inbox needs them first. Task 12 imports them from `@/features/news`; do not add a second mapper.

- [ ] **Step 1:** Confirm `noticeTargetRoute` is exported from `@/features/news` and that its test covers every parent target and the unchanged child mapping. If either is missing, plan 2 is not finished: stop and finish plan 2 first.

---

### Task 11: register the phone for push after sign-in

**Files:**
- Create: `apps/mobile/src/features/push/{channel.ts,register.ts,use-push-registration.ts,push-bridge.tsx,index.ts}`
- Modify: `apps/mobile/app/_layout.tsx` (mount `<PushBridge />` inside `SessionProvider`), `docs/mobile.md` (Rules: Push)
- Test: `apps/mobile/tests/features/push/register.test.ts`

**Interfaces:**
- Consumes: plan 2 `registerBeforeSignOut`, `useSession()` (`status`, `userId`); Task 6 `pushPromptCopy`; `apiFetch`.
- `channel.ts`: `NOTICE_CHANNEL = "notices"`; `ensureNoticeChannel(): Promise<void>` — `Notifications.setNotificationChannelAsync("notices", { name: "Notices", importance: AndroidImportance.DEFAULT })`.
- `register.ts`:
  - `registerForPush(args: { userId: string; role: NoticeRole; ask: (role: NoticeRole) => Promise<boolean> }): Promise<string | null>` — returns the registered token or null. Order: `!Device.isDevice` → null; `ensureNoticeChannel()` (before any permission request, Android 13 rule); `getPermissionsAsync()`; if not granted and status `undetermined` and not yet asked for this user (`AsyncStorage` key `jarso-push-asked:<userId>`): set the key, `await ask(role)`, on yes `requestPermissionsAsync()`; not granted → null; `getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId })`; `apiFetch("/api/v1/push/tokens", { method: "POST", auth: true, body: { token, platform: "android" } })`; any error → `logger.warn("Push registration failed", { code })`, null (never thrown, never the token).
  - `unregisterFromPush(token: string): Promise<void>` — `apiFetch(..., { method: "DELETE", auth: true, body: { token } })`; on any failure `Notifications.unregisterForNotificationsAsync()` (Review Focus 1); never throws.
  - `askForPush(role: NoticeRole): Promise<boolean>` — `Alert.alert(pushPromptCopy.title, pushPromptCopy[role], [later, allow])` resolved as a promise.
- `push-bridge.tsx`: `PushBridge(): null` — calls `usePushRegistration()`; Task 12 extends it.
- `use-push-registration.ts`: `usePushRegistration(): void` — when `status` is `"child"` or `"parent"`, runs `registerForPush` once per `userId`, keeps the token in a ref, re-registers on `Notifications.addPushTokenListener`, and calls `registerBeforeSignOut(() => token ? unregisterFromPush(token) : Promise.resolve())` once, disposing it on unmount.

- [ ] **Step 1: Write the failing tests** (mock `expo-notifications`, `expo-device`, `expo-constants`, AsyncStorage, `@/lib/api`):
  - `creates the notices channel before asking permission` (call order).
  - `already granted → posts the token without asking` (exact `apiFetch` args above).
  - `undetermined → asks with the role's copy, then the system prompt; denied → no POST and the ask is remembered`.
  - `asked before for this user → no prompt, no POST`; `another user on the same phone is asked once`.
  - `not a device → nothing`.
  - `a rotated token is posted again`.
  - `unregister sends DELETE with the token`; `unregister falls back to unregisterForNotificationsAsync when DELETE fails`; `unregister never throws`.
  - `the sign-out hook is registered once per signed-in user and disposed on unmount`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/mobile test push/register`. Expected: FAIL.
- [ ] **Step 3:** Implement; add the "Push" rule to `docs/mobile.md` (when it registers, the per-user ask key, unregister before sign-out and its fallback, dev build only).
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5: Commit** (when authorised): `feat(mobile): register for push after sign-in`

---

### Task 12: open the right screen from a push

**Files:**
- Create: `apps/mobile/src/features/push/{use-push-taps.ts,foreground.ts}`
- Modify: `apps/mobile/src/features/push/{push-bridge.tsx,index.ts}`
- Test: `apps/mobile/tests/features/push/taps.test.tsx`

**Interfaces:**
- Consumes: Task 6 `pushDataSchema`; plan 2's `noticeTargetRoute` (from `@/features/news`); `useMarkRead` from `@/features/news`; `useSession()`.
- `foreground.ts`: `pushPresentation(data: unknown, userId: string | undefined): NotificationBehavior` — matching recipient → `{ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }` (the in-app listener already shows it); any other or unparseable → all false. `installForegroundHandler(getUserId: () => string | undefined): void` wires it into `Notifications.setNotificationHandler`.
- `use-push-taps.ts`: `usePushTaps(): void` — reads `Notifications.useLastNotificationResponse()`; waits until `status` is `"child"` or `"parent"`; handles each response identifier once (ref); parses `content.data` with `pushDataSchema`; invalid or `recipientId !== userId` → `router.push` to the role's Home and marks nothing; kind `summary` → `router.push("/(child)/(tabs)/news")`, marks nothing; kind `notice` → `markRead.mutate([noticeId])` (errors logged by name only) and `router.push(noticeTargetRoute(target, role))`.
- `push-bridge.tsx` (from Task 11): `PushBridge(): null` now also calls `usePushTaps()` and installs the foreground handler once.

- [ ] **Step 1: Write the failing tests:**
  - `tap on a parent's handover push opens /(parent)/children/<c>/handover/allowance/<o> and marks the notice read`.
  - `tap on a child's ledger push opens /(child)/(tabs)/diary`.
  - `tap on an overnight summary opens News and marks nothing read`.
  - `push for another recipient opens role home and marks nothing`.
  - `malformed data opens role home`.
  - `cold start waits for the session then navigates once` (response present while `status: "loading"`, then `"parent"`).
  - `the same response navigates once across re-renders`.
  - `foreground: own notice is listed without a banner; another user's is not shown`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/mobile test push/taps`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5: Commit** (when authorised): `feat(mobile): open the notice screen from a push`

---

### Task 13: Maestro push flow and device check

**Files:**
- Create: `apps/mobile/e2e/push.yaml`, `apps/mobile/e2e/scripts/child-asks.js`
- Modify: `docs/mobile.md` (Device e2e: the flow, its extra `-e` vars, physical device only), `tasks/todo.md` (device checklist)

**Interfaces:**
- Consumes: plan 2's parent sign-in flow (`e2e/parent-sign-in.yaml` or its equivalent name); `POST /api/v1/auth/child-sign-in` (`{ accessToken, … }`); RPC `create_withdrawal` (args as in `packages/data/src/requests/repository.ts:156`); `POST /api/v1/notices/dispatch`.
- `child-asks.js` (Maestro `runScript`, GraalJS `http`): signs the test child in, creates a small withdrawal request through `${SUPABASE_URL}/rest/v1/rpc/create_withdrawal` with the publishable key and the child bearer, then POSTs dispatch. Reads `API_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CHILD_*` from `-e`; prints nothing.

- [ ] **Step 1: Write `push.yaml`:** parent signs in on the phone; tap "Turn on" then the system "Allow"; `runScript: scripts/child-asks.js`; open the shade (`swipe` from the top edge); `extendedWaitUntil` the notice title containing `${CHILD_NICKNAME}` (30 s); tap it; `assertVisible` the child hub. Then sign out; run the script again; wait 30 s; open the shade; `assertNotVisible` a new notice (`'signing out stops pushes'`). Parents are never held, so the flow runs at any hour.
- [ ] **Step 2:** On a physical Android phone with the Task 1 dev build (FCM credentials set in EAS) against `pnpm dev` and the hosted project, run `pnpm --filter @jarso/mobile e2e push.yaml` with the `-e` flags. Expected: PASS.
- [ ] **Step 3:** Manual "Done when" checks, recorded in `tasks/todo.md`: the parent's decision pushes the child's phone and the tap opens the right screen; a child notice created at 22:00 family time does not push at night, is unread in News, and arrives after 07:00 (two or more as one 'You have N new notices' push that opens News) — set the test family's timezone to move its clock, then revert; a different family member signing in on the same phone gets only their own pushes; the 15-minute sweep delivers an allowance reminder.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5: Commit** (when authorised): `test(mobile): Maestro flow for push`

---

### Task 14: per-phone notification settings (server)

Added after plan review (from the user: "they should control their own device"). Each phone decides which groups of notices buzz it. The inbox is unchanged. Needs Tasks 2, 6 and 8. Its migration goes through the same "ask the user before `pnpm db:push`, then `pnpm db:types:linked`" step as Task 5.

**Files:**
- Create: `supabase/migrations/<ts>_device_push_prefs.sql`, `supabase/tests/database/device_push_prefs.test.sql`
- Modify: `packages/core/src/notifications/{push.ts,types.ts,schemas.ts,copy.ts,index.ts}`, `apps/web/src/features/notifications/server/{push.ts,repository.ts}`, `docs/database.md`, `docs/testing.md`, `docs/adr/0012-web-push.md` (amendment: per-phone settings)
- Test: `packages/core/tests/notifications/push-groups.test.ts`, `apps/web/tests/features/notifications/server/push.test.ts`

**Interfaces:**
- SQL:
  - `device_push_tokens` gains `muted_groups text[] not null default '{}'` (check: every element in `('requests','money','learning','notes')`) and `paused boolean not null default false`.
  - `set_device_push_prefs(p_token text, p_muted_groups text[], p_paused boolean) returns boolean`: security definer, `set search_path = ''`, `authenticated` only. It updates only the caller's row for that token and returns false when there is none.
  - `device_push_tokens_for` is dropped and recreated, returning `(id uuid, profile_id uuid, token text, muted_groups text[], paused boolean)`, `service_role` only.
  - A token moving to another account is deleted and re-inserted (Task 2 rule), so it starts with defaults. Unregistering deletes the settings with the row.
- Core:
  - `type NoticeGroup = "requests" | "money" | "learning" | "notes"`.
  - `noticeGroup(kind: NotificationKind): NoticeGroup` maps every kind:
    - `requests`: `*_requested`, `*_decided`, `limit_exceeded`.
    - `money`: `allowance_due`, `handover_reminder`, `card_charge_failed`, `money_received`, `entry_corrected`, `jar_moved`.
    - `learning`: `guide_noticed`.
    - `notes`: `parent_note`.
    - The switch is exhaustive, so a new kind fails typecheck until it is placed.
  - `type DevicePushPrefs = { mutedGroups: NoticeGroup[]; paused: boolean }`.
  - `planForDevice(plan: PushPlan, prefs: DevicePushPrefs): PushPlan | null`:
    - paused → null;
    - a `notice` plan whose group is muted → null;
    - a `summary` plan keeps only notices in unmuted groups: 0 left → null, 1 → a `notice` plan, 2 or more → a `summary` with that count.
  - `devicePushPrefsSchema = z.object({ token: <EXPO_PUSH_TOKEN>, mutedGroups: z.array(z.enum([...])).max(4), paused: z.boolean() })`.
  - `noticeGroupCopy`: labels and one-line hints for the settings page, in children's-voice wording that also reads well for parents: "Requests and answers", "Allowance and money", "Learning and Jarso", "Notes from family"; a "Pause all" label; "Notices still show in your inbox." (the child's News uses the same line).
- Web: `DeviceTokenRow` gains `mutedGroups: NoticeGroup[]` and `paused: boolean`. In `dispatchPush`'s Expo branch, each (plan, token) pair goes through `planForDevice` first; null means no message for that token. Web push is unchanged.

- [ ] **Step 1: Write the failing core tests:**
  - `noticeGroup places every NotificationKind` (a table over all kinds);
  - `planForDevice drops everything when paused`;
  - `planForDevice drops a notice in a muted group`;
  - `planForDevice shrinks a summary to its unmuted notices` (3 overnight, 2 of them `money` and muted → one `notice` plan);
  - `planForDevice keeps a summary of 2+ unmuted` (count is right);
  - `devicePushPrefsSchema rejects an unknown group`.
- [ ] **Step 2: Write the pgTAP file:**
  - defaults are `'{}'` and false;
  - pa sets `{money}` and true on their own token, returning true;
  - pa setting c1's token returns false and leaves it unchanged;
  - `'unknown'` in groups → `'23514'`;
  - anon has no execute;
  - as `service_role`, `device_push_tokens_for` returns the new columns;
  - re-registering the same token as another profile resets the settings to defaults.
- [ ] **Step 3: Write the failing web tests:**
  - `Expo skips a token whose group is muted, still sends to the account's other phone`;
  - `a paused phone gets nothing while web push still sends`;
  - `a summary to a phone that muted money counts only the other notices`.
- [ ] **Step 4:** Run the targeted tests. Expected: FAIL.
- [ ] **Step 5:** Write the migration and the code. Stop for the user's OK before `pnpm db:push`, then run `pnpm db:types:linked`.
- [ ] **Step 6:** Run `TURBO_CONCURRENCY=2 pnpm check`. Expected: green.
- [ ] **Step 7: Commit** (when authorised), two commits: `feat(db): per-phone notification settings` and `feat(notifications): honour per-phone push settings`.

---

### Task 15: Notifications settings page (phone)

As built in Task 14: the group type is `PushGroup` (core already had a `NoticeGroup` for the inbox), the kind type is `NoticeKind`, and `NOTICE_GROUPS` lists the four groups. `noticeGroupCopy` also has a one-line hint for each group and for "Pause all".

**Files:**
- Create: `apps/mobile/src/features/push/{notification-settings.tsx,use-device-push-prefs.ts}`, `apps/mobile/app/(parent)/notifications.tsx`, `apps/mobile/app/(child)/notifications.tsx`
- Modify: `apps/mobile/src/features/push/index.ts`, `apps/mobile/app/(parent)/settings.tsx` (a "Notifications" row), the child Me screen `apps/mobile/app/(child)/me.tsx` (a "Notifications" row), `docs/mobile.md`
- Test: `apps/mobile/tests/features/push/notification-settings.test.tsx`

**Interfaces:**
- Consumes:
  - Task 11's stored current token: `getRegisteredToken(): Promise<string | null>` from features/push. If Task 11 named it differently, use that name and say so.
  - Task 14's `noticeGroupCopy` and `devicePushPrefsSchema`.
  - Plan 1's `ScreenHeader`, `Card`, `ListRow`, and `BodySizeProvider` from the role layout.
- `useDevicePushPrefs(): { prefs: DevicePushPrefs | null; status: "loading" | "ready" | "no-token" | "denied"; save(next: DevicePushPrefs): Promise<void> }`:
  - reads the caller's own row directly (`select muted_groups, paused from device_push_tokens where token = $current`, allowed by RLS);
  - saves through RPC `set_device_push_prefs`, optimistically, rolling back on error;
  - status is `denied` when `Notifications.getPermissionsAsync()` is not granted.
- `<NotificationSettings />`:
  - a "Pause all" switch at the top;
  - four group switches, with the copy from `noticeGroupCopy`, disabled while paused;
  - the line "Notices still show in your inbox.";
  - on a child, the fixed note "Quiet from 9pm to 7am." (not a switch);
  - when `denied`: "Notifications are off for Jarso on this phone." and a "Open phone settings" button (`Linking.openSettings()`);
  - when `no-token`: a "Turn on" button that runs Task 11's register flow;
  - switches meet the 48 dp target and carry `accessibilityRole="switch"` and a label.

- [ ] **Step 1: Write the failing tests:**
  - `shows four groups and pause, all on by default`;
  - `turning money off saves mutedGroups ['money']`;
  - `pause disables the group switches`;
  - `a failed save puts the switch back and shows an error`;
  - `denied permission shows Open phone settings`;
  - `child sees the quiet hours note, parent does not`;
  - `no token shows Turn on`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/mobile test notification-settings`. Expected: FAIL.
- [ ] **Step 3:** Implement the hook, the component, both routes and the two settings rows.
- [ ] **Step 4:** Run `TURBO_CONCURRENCY=2 pnpm check`. Expected: green.
- [ ] **Step 5:** Manual device check, added to `tasks/todo.md` with Task 13's checks:
  - mute "Requests and answers" on the parent phone; a child's request still shows in the parent's Inbox but doesn't buzz;
  - on another phone signed in to the same parent account, it still buzzes;
  - pausing stops everything;
  - after signing out and back in, the settings start fresh.
- [ ] **Step 6: Commit** (when authorised): `feat(mobile): per-phone notification settings`

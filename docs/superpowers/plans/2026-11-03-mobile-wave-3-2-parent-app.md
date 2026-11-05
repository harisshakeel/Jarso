# Mobile wave 3, plan 2 of 4: parents on the phone (Android) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent signs in on the Android app with email and password, finishes setup if needed, and runs the family from the phone: family home, children and the child hub (handover by cash, history, gifts, allowance, rules, learning, the child's Jarso chats), inbox, settings, their own Jarso chat, adding a child and accepting an invitation.

**Architecture:** The session provider learns a second role and routes to a new `(parent)` group; each group's guard redirects the wrong role. Reads and writes go straight to Supabase through `@jarso/data` (parent-side RPC wrappers and compositions move there from web repositories and services; web re-exports and wraps them, so web behaviour is unchanged). `/api/v1` bearer routes exist only where the admin client, Claude or a server-only check is needed (add child, PIN, remove, invitations, guide state and drafts, family summary). Parent copy moves from web components to `@jarso/core`. Card payment UI is a placeholder slot that plan 4 fills.

**Tech Stack:** Expo SDK 58 + Expo Router, NativeWind, TanStack Query, supabase-js, `@react-native-community/datetimepicker` (new), jest-expo + RNTL, Vitest, Maestro, Biome, Turborepo, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-03-mobile-wave-3-design.md` (Goals 1, 6, 7; Decided §1, §2, §3 without the payments and push rows, §7, §8; Screens table without the saved-card row; mockup C in `docs/superpowers/specs/mockups/2026-11-03-mobile-wave-3-type-scale.html`). Earlier specs and ADR 0016, 0017 still hold.

## Global Constraints

- Android only. No `bundleIdentifier`, no iOS-only branches.
- The phone is not trusted. Every direct write is an existing Postgres function that checks `auth.uid()` / `is_parent_of`; every new route calls `assertRole("parent")` (or a DAL helper built on it) server-side. A child bearer gets 403 on every parent route.
- No migration. Every RPC this plan calls exists today. If one turns out to be missing or unsafe for a direct call: stop and raise it.
- ADR 0008: profile completion is enforced by the app, not the database. The phone must keep every parent write behind the setup gate (Task 3c).
- Direct to Supabase where RLS and a function can authorise (ADR 0016); `/api/v1` only for admin, Claude or a server-only check. Routes: `withApi(handler, { bearer: true })`, body/params Zod-parsed, handler calls the existing web service. `security-auditor` reviews the route set before merge.
- Web unchanged for users. Moved code is re-exported behind `server-only`; web services become auth + call; moved copy byte-identical; web unit and e2e tests stay green (tests that move go to `packages/data/tests/` or `packages/core/tests/`).
- `@jarso/core` / `@jarso/data` purity (CLAUDE.md rule 18): no React, Next, `server-only`, `@/**`; data takes the client as its first argument; logging through core's `logger`.
- Type tokens from plan 1 (`docs/superpowers/plans/2026-11-03-mobile-wave-3-1-type-scale.md`) only: `text-display text-h1 text-h2 text-h3 text-body text-body-parent text-small text-caption text-money-xl text-money-l text-money`. Parent body text is 15/21: the `(parent)` layout wraps its stack in `<BodySizeProvider size="parent">` and body text uses `useBodySizeClass()` (both from `@/components/ui`), so screens do not hand-write `text-body-parent`. Layout pieces come from `@/components/screen` (`Card`, `CardSeparator`, `Eyebrow`, `ListRow`, `ScreenHeader`, `TabHeading`); date lines use `todayLine()` and titles/money `fontScaleCap()` from `@/lib`. All of these exist from plan 1. No raw `text-Nxl` / `text-lg` / `text-sm`. At most one `text-display` or `text-money-xl` per screen. Plan 1 lands first.
- Calm layout (spec §9): lists over stacked cards for repeated items, one accent per card, meta in `text-muted-foreground`, 16 dp gutters, 12 to 16 dp card padding, 48 dp touch targets, every control labelled with a role.
- Hrefs into a group are always group-qualified (`/(parent)/(tabs)`, `/(child)/(tabs)`): `/` and `/jarso` exist in both groups.
- Money is integer minor units. Each write that takes an `idempotencyKey` gets one per screen or sheet opening (`expo-crypto` `randomUUID`).
- After every write that can leave a notice (handover, not given, request decision, gift, note, rules), call `dispatchNotices()` (`apps/mobile/src/lib/notices.ts`).
- Cross-plan contracts (fixed): the routes listed in File Structure; `status: "parent"` on the session, `CardPaymentSlot`, `AutoChargeSlot`, `SavedCardsSlot` and `registerBeforeSignOut` exactly as in Task 3; `useOpenNotice(role)` and `noticeTargetRoute(target, role)` as in Task 3b (plan 3 uses them for push taps, not a second mapper); the Maestro file `parent-sign-in.yaml` (plan 4 reuses it).
- `pnpm check` and `pnpm turbo lint typecheck test build` green after every task.
- Never read `.env*`, never print credentials (rule 17). Maestro credentials come from `-e` flags.
- Commits: Conventional Commits, subject ≤ 60 chars, one logical change each, no AI attribution. **Commit steps run only after the user says to commit.**

## Review Focus

1. **Cold start or a link resolves `/` to the child group for a parent** (both groups own `/`). Expected: the parent lands on Family, never a child screen and never a redirect loop; a child opening a parent route lands on the child Home. *(Task 3b tests: `parent at child group redirects to parent tabs`, `child at parent route redirects to child home`)*
2. **Parent with no family or an unfinished profile.** Expected: every parent screen goes to setup, setup shows only the missing step, and after finishing it the app moves on without a loop or stale gate. *(Task 3c test: `setup gate clears after profile then family`)*
3. **Sign-out while offline or while a `beforeSignOut` hook hangs or throws.** Expected: the session is still cleared within about 5 s, other hooks still run. *(Task 3a test: `hung or failing hook does not block sign-out`)*
4. **A child's token on a parent route.** Expected: 403 `FORBIDDEN`, nothing written, no admin call. *(Task 2 tests: `child bearer → 403` in every route test)*
5. **An invite link opened while signed out, or by a parent without setup.** Expected: after sign-in and setup the parent lands on the invite screen with the code kept, not on Family with the link lost. *(Task 6 test: `invite link survives sign-in and setup`)*

---

## File Structure

```
packages/core/src/allowance/copy.ts                  NEW  parent allowance, gift, handover, pause, needs-you copy + write error lines
packages/core/src/{family,profiles,rules,requests,dashboard,guide,notifications}/parent-copy.ts  NEW  copy moved from web parent components
packages/core/src/dashboard/types.ts                 MODIFY FamilyDashboard type moves here
packages/data/src/allowance/{repository,writes,reads}.ts  MODIFY/NEW parent RPCs, write compositions, schedule/gift reads
packages/data/src/{rules,family,notifications,guide,ledger}/  MODIFY parent writes and reads
packages/data/src/profiles/{repository,index}.ts     NEW
packages/data/src/dashboard/{family,index}.ts        NEW  getFamilyDashboard
packages/data/package.json                           MODIFY exports ./profiles, ./dashboard
apps/web/src/features/{allowance,rules,family,profiles,guide,notifications,ledger,dashboard}/server/  MODIFY re-export + wrap
apps/web/src/app/api/v1/children/route.ts                         NEW POST
apps/web/src/app/api/v1/children/[childId]/route.ts               NEW DELETE
apps/web/src/app/api/v1/children/[childId]/pin/route.ts           NEW PATCH
apps/web/src/app/api/v1/invitations/route.ts                      NEW POST (accept)
apps/web/src/app/api/v1/invitations/lookup/route.ts               NEW POST
apps/web/src/app/api/v1/guide/state/route.ts                      MODIFY parent branch
apps/web/src/app/api/v1/guide/drafts/confirm/route.ts             NEW POST
apps/web/src/app/api/v1/family/summary/route.ts                   NEW GET
apps/mobile/app/(auth)/sign-in.tsx                   MODIFY child | parent
apps/mobile/app/(auth)/parents.tsx                   DELETE
apps/mobile/app/(child)/_layout.tsx                  MODIFY parent → parent tabs
apps/mobile/app/(parent)/_layout.tsx                 NEW  guard, setup gate, pages, sheets, NoticeListener
apps/mobile/app/(parent)/(tabs)/{_layout,index,children,jarso,inbox}.tsx
apps/mobile/app/(parent)/{settings,setup,invite}.tsx
apps/mobile/app/(parent)/children/new.tsx
apps/mobile/app/(parent)/children/[childId]/{index,history,rules,learning,allowance}.tsx
apps/mobile/app/(parent)/children/[childId]/gifts/{new,[giftId]}.tsx
apps/mobile/app/(parent)/children/[childId]/guide/{index,[conversationId]}.tsx
apps/mobile/app/(parent)/children/[childId]/handover/[kind]/[id].tsx
apps/mobile/src/features/auth/{sign-in-parent,parent-sign-in-form,before-sign-out,role-home}.ts(x)   NEW
apps/mobile/src/features/auth/session-provider.tsx   MODIFY parent role, hooks
apps/mobile/src/features/setup/                      NEW  useParentSetup, setup screen (profile, family)
apps/mobile/src/features/payments/{card-payment-slot,auto-charge-slot,saved-cards-slot,index}.ts(x)  NEW  placeholders (plan 4)
apps/mobile/src/features/family/                     NEW  family reads/writes, children list, add child, invite, settings parts
apps/mobile/src/features/allowance/                  NEW  due, schedule, gifts, handover, allowance and gift forms, pause
apps/mobile/src/features/rules/                      NEW  rules form
apps/mobile/src/features/requests/                   MODIFY parent request items
apps/mobile/src/features/news/                       MODIFY role-aware inbox, listener, useOpenNotice(role), noticeTargetRoute
apps/mobile/src/features/history/                    MODIFY childId + read-only mode
apps/mobile/src/features/learning/learning-summary.tsx  NEW  parent read-only
apps/mobile/src/features/guide/                      MODIFY parent chat, child chats, switch
apps/mobile/src/features/parent/                     NEW  composite screens: family home, children, child hub, settings
apps/mobile/src/components/ui/date-field.tsx         NEW
apps/mobile/src/lib/{query,flash}.ts                 MODIFY keys / NEW flash()
apps/mobile/e2e/parent-*.yaml                        NEW
docs/{mobile,api,auth,architecture,testing}.md, CLAUDE.md, tasks/todo.md
```

---

### Task 1: parent data and copy shared

One SDD task: parts in order, then one review. Each part keeps its own test cycle. Web tests that covered moved code move with it.

#### 1a: allowance, gifts and handover in `@jarso/data`

**Files:**
- Create: `packages/data/src/allowance/{writes,reads}.ts`, `packages/core/src/allowance/copy.ts`
- Modify: `packages/data/src/allowance/{repository,index}.ts`, `apps/web/src/features/allowance/server/{repository,service}.ts`
- Test: `packages/data/tests/allowance/{repository,writes,reads}.test.ts`, `packages/core/tests/allowance/copy.test.ts`; `apps/web/tests/features/allowance/server/*` stay green

**Interfaces:**
- Moved verbatim from the web repository into `packages/data/src/allowance/repository.ts` (same names and signatures, `Client` first): `fetchScheduleAutoCharge`, `fetchNextDueOn`, `findScheduleChildId`, `findScheduleState`, `findOccurrenceChildId`, `findGift`, `listPendingGifts`, `listDueForParent`, `findLatestAllowanceSplit`, `findLatestGiftSplit`, `markPlanDecided`, `insertSchedule`, `changeSchedule`, `pauseSchedule`, `resumeSchedule`, `stopSchedule`, `insertGift`, `changeGift`, `cancelPendingGift`, `confirmOccurrenceHandover`, `confirmGiftHandover`, `closeOccurrence`, types `ScheduleRow`, `GiftRecord`, `GiftRow`, `LatestSplit`. The web's full `findLatestSchedule` becomes `findScheduleRow(db, childId): Promise<ScheduleRow | null>` (the child-safe `findLatestSchedule` keeps its name). `asProviderId` uses core's `isPaymentProviderId`.
- `@jarso/core/allowance` `allowanceErrors`: `alreadyExists`, `nextOn`, `stopped`, `notRunning`, `notPaused`, `alreadyStopped`, `giftDone`, `notGiven`, `giftCancelled`, `giftNotDue`, `giftDatePast` (the strings in `service.ts` today, verbatim).
- `writes.ts` (the service logic minus auth, same results and errors as today): `createAllowance(db, input: { childId; amountMinor; frequency; firstOn }): Promise<string>`, `changeAllowance(db, input: { scheduleId; amountMinor; frequency; nextOn }): Promise<void>` (22023 → `VALIDATION` with `fieldErrors.nextOn`), `pauseAllowance(db, { scheduleId; through: string | null; message: string | null })`, `resumeAllowance(db, scheduleId)`, `stopAllowance(db, scheduleId)`, `createGift(db, { childId; amountMinor; giveOn; note: string | null; idempotencyKey })`, `updateGift(db, input, today: string)`, `cancelGift(db, giftId)`, `confirmHandover(db, { kind: "allowance" | "gift"; id; cashMinor; savedMinor; idempotencyKey }): Promise<HandoverResult>`, `markNotGiven(db, occurrenceId): Promise<NotGivenResult>`. `conflictAs` and `unlessReached` move here as private helpers.
- `reads.ts`: `getParentSchedule(db, childId, viewerId): Promise<Schedule | null>` (row, `nextDueOn` unless stopped, auto-charge columns, `autoChargeMine`), `listGiftsFor(db, childId, viewerId): Promise<Gift[]>`, `getLastSplitWith(db, childId): Promise<Split | null>` (moved).
- Web: repository re-exports; services keep their auth checks and call `shared.*` (`import * as shared from "@jarso/data/allowance"`).

- [ ] **Step 1:** Move the web repository tests to `packages/data/tests/allowance/repository.test.ts` (fake client from `packages/data/tests/fake-client.ts`). Add `writes.test.ts`: `create conflict says alreadyExists`; `change 22023 puts nextOn field error`; `pause conflict already paused at same date resolves`; `stop conflict when not stopped says notRunning`; `handover not_given throws CONFLICT notGiven`; `gift handover cancelled throws CONFLICT giftCancelled`; `updateGift past changed date → VALIDATION giveOn`, `updateGift same past date passes`. `reads.test.ts`: `stopped schedule has null nextDueOn`; `autoChargeMine true only for the viewer`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/data test allowance`. Expected: FAIL.
- [ ] **Step 3:** Implement the move; web services call `shared.*` after their auth.
- [ ] **Step 4:** Run `pnpm check`. Expected: green, web allowance service tests unchanged.
- [ ] **Step 5:** Commit (when authorised): `refactor(data): share allowance and handover writes`.

#### 1b: rules, family, profiles, notes, guide access, parent chats

**Files:**
- Create: `packages/data/src/profiles/{repository,index}.ts`
- Modify: `packages/data/src/{rules,family,notifications,guide}/repository.ts`, `packages/data/src/guide/transcript.ts`, `packages/data/src/ledger/history.ts`, `packages/data/package.json`, matching web `server/{repository,service}.ts` in `rules`, `family`, `profiles`, `notifications`, `guide`, `ledger`
- Test: `packages/data/tests/{rules,family,profiles,notifications,guide,ledger}/*.test.ts`

**Interfaces:**
- `@jarso/data/rules`: `saveMoneyRule`, `saveJarMovesApproval`, `saveAllowNegativeSpend` (moved).
- `@jarso/data/family`: `insertFamily`, `listChildMembers`, `renameChildMember`, `updateFamilyTimezone`, `listInvitationsForCaller` (moved); `createFamilyWithFallback(db, input: CreateFamilyInput): Promise<Family>` (the service's 22023 → retry with `"UTC"` and a `logger.warn`, then `findFamilyById`).
- `@jarso/data/profiles`: `findProfileById`, `updateProfileById`, `findParentDetails`, `upsertParentDetails` (moved; core `logger`).
- `@jarso/data/notifications`: `insertChildNote` (moved; the `JA429` line verbatim).
- `@jarso/data/guide`: `findGuideAccess`, `saveGuideAccess` (the web repo's `setGuideAccess`, renamed to avoid the service name), `findConversation`, `listConversationsAskedBy`, `countFlaggedSince` (moved); compositions from the web service bodies: `listChildChats(db, childId): Promise<ConversationSummary[]>`, `getChildTranscript(db, childId, conversationId)`, `listChatsAskedBy(db, userId)`, `getAskerTranscript(db, userId, conversationId)` (same return types as `getGuideTranscript` / `getParentTranscript`).
- `@jarso/data/ledger`: `getBalanceHistory(db, childId, opts: { timezone: string; now: Date }): Promise<BalanceHistory>`.
- `packages/data/package.json` exports `./profiles`.

- [ ] **Step 1:** Tests: `createFamilyWithFallback retries with UTC on 22023`, `other errors rethrow`; `findParentDetails unlisted country → null`; `insertChildNote JA429 → RATE_LIMITED with the web line`; `getChildTranscript other child's conversation → null`; `getAskerTranscript someone else's chat → null`; `listChildChats flagged first`; `getBalanceHistory spans GRAPH_DAYS in the family timezone`. Move the web repository tests these replace.
- [ ] **Step 2:** Run `pnpm --filter @jarso/data test`. Expected: FAIL.
- [ ] **Step 3:** Implement; web services wrap.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `refactor(data): share family, rules, profile and guide reads`.

#### 1c: family dashboard composition

**Files:**
- Create: `packages/data/src/dashboard/{family,index}.ts`
- Modify: `packages/core/src/dashboard/types.ts` (`FamilyDashboard`), `packages/data/package.json` (`./dashboard`), `apps/web/src/features/dashboard/server/service.ts`
- Test: `packages/data/tests/dashboard/family.test.ts`; move `apps/web/tests/features/dashboard/server/service.test.ts` cases there, keep one web test for the wrapper

**Interfaces:**
- `getFamilyDashboard(db, opts: { userId: string; days: number; now: Date; guideOn: boolean }): Promise<FamilyDashboard | null>`: same reads and nice-to-have fallbacks as the web service today (jars and due required; goal, schedule, gifts, history, balances, chats fall back), using 1a/1b reads.
- Web `getFamilyDashboard(days)` keeps its signature: `assertSignedInAs`-equivalent via `currentRole() === "parent"`, then the shared call with `createClient()`, `guideOn: isGuideConfigured()`.

- [ ] **Step 1:** Tests: `no family → null`; `a failed goal read leaves goal null, page still built`; `a failed jars read rejects`; `guideOn false reads no chats`; `flaggedChats counts this week only`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green, parent e2e projects unaffected.
- [ ] **Step 5:** Commit (when authorised): `refactor(data): share the family dashboard reads`.

#### 1d: parent copy into core

**Files:**
- Create: `packages/core/src/{family,profiles,rules,requests,dashboard,guide,notifications}/parent-copy.ts`; extend `packages/core/src/allowance/copy.ts`
- Modify: the web components the strings come from: `allowance/components/{needs-you,handover-form,gift-form,allowance-form,allowance-summary,pause-sheet,parent-allowance-card,due-list}.tsx`, `family/components/{create-family-form,add-child-form,accept-invitation-form,invitation-list,family-code-card,children-settings-list,rename-child-form,set-pin-form,remove-child-dialog,family-settings-form,first-child-card}.tsx`, `profiles/components/{display-name-form,parent-details-form,profile-completion-dialog}.tsx`, `rules/components/{rules-form,jar-moves-choice,overspend-switch}.tsx`, `requests/components/parent-request-items.tsx`, `dashboard/components/{timeline-card,family-summary,child-tiles}.tsx`, `guide/components/{guide-switch,parent-views,memory-list,jarso-chat-page}.tsx`, `notifications/components/send-note-sheet.tsx`, and the page headings of the routes in the Screens table
- Test: `packages/core/tests/<module>/parent-copy.test.ts`; existing web component tests stay green

**Interfaces:**
- Each module exports one object, e.g. `handoverCopy`, `giftCopy`, `allowanceFormCopy`, `pauseCopy`, `needsYouCopy`, `setupCopy`, `addChildCopy`, `inviteCopy`, `familySettingsCopy`, `profileCopy`, `rulesCopy`, `parentRequestCopy` (incl. `requestSentence(request, nickname, amount): string`, the two sentence forms in `parent-request-items.tsx`), `dashboardCopy`, `parentGuideCopy`, `noteCopy`, plus `nicknameTaken = "Another child in your family already uses this nickname"`. Labels, hints, buttons, toasts, empty states and confirmations, verbatim. Pure helpers that sit inside those components move too, named in the object's file.

- [ ] **Step 1:** Tests: snapshot each copy object; `requestSentence` emergency and plain forms match today's web output.
- [ ] **Step 2:** Run `pnpm --filter @jarso/core test`. Expected: FAIL.
- [ ] **Step 3:** Move strings; web components import them (no wording change).
- [ ] **Step 4:** Run `pnpm check`. Expected: green, web component tests unchanged.
- [ ] **Step 5:** Commit (when authorised): `refactor(core): move parent copy out of web components`.

### Task 2: bearer routes for the parent phone

**Files:**
- Create: the eight route files in File Structure
- Modify: `apps/web/src/features/family/server/{service,actions}.ts` (`nicknameConflict` moves to the service as `withNicknameConflict`), `apps/web/src/app/api/v1/guide/state/route.ts`, `docs/api.md`
- Test: `apps/web/tests/app/api/v1/{children,children/[childId],children/[childId]/pin,invitations,invitations/lookup,guide/state,guide/drafts/confirm,guide/turns,family/summary}/route.test.ts`

**Interfaces:**
- `withNicknameConflict<T>(work: Promise<T>): Promise<T>`: CONFLICT → `AppError("CONFLICT", "Please fix the highlighted fields.", { fieldErrors: { nickname: [nicknameTaken] } })`. Actions use it too (behaviour unchanged).
- `POST /api/v1/children` body `addChildSchema` → `assertRole("parent")`, no membership → 403 "Set up your family first.", `withNicknameConflict(addChild({ familyId, ...body }))` → `{ data: ChildSummary }` (201).
- `PATCH /api/v1/children/[childId]/pin` body `{ pin }` (with `childId` from params, parsed by `setChildPinSchema`) → `setChildPin` → `{ data: { ok: true } }`.
- `DELETE /api/v1/children/[childId]` (`removeChildSchema` on params) → `assertRole("parent")`, `removeChild` → `{ data: { ok: true } }`. A retry after a half removal succeeds (same as the action).
- `POST /api/v1/invitations/lookup` body `{ invite: string }` (`acceptInvitationSchema.shape.invite`) → `findInvitation(invite)` → `{ data: { nickname } }`, null → 404 `INVITATION_GONE`. Rate limit is the service's (10/h per parent).
- `POST /api/v1/invitations` body `acceptInvitationSchema.or(acceptListedInvitationSchema)` → `withNicknameConflict(acceptInvitation | acceptListedInvitation)` → `{ data: ChildSummary }`.
- `GET /api/v1/guide/state`: child unchanged; parent → `{ data: ParentGuideState }`, `ParentGuideState = { configured: boolean; enabledChildIds: string[] }` (type in `@jarso/core/guide`), from `isGuideConfigured()` and `getGuideAccess` per child (failed read → off).
- `POST /api/v1/guide/drafts/confirm` body `confirmActionDraftSchema` → `assertUser()`, `confirmActionDraft(draft)`, `pushAfterNotices()` → `{ data: ActionOutcome }`. (Drafts have no stored id; the spec's `/drafts/:id` becomes a body.)
- `GET /api/v1/family/summary?days=7|30|90` → `assertRole("parent")`, `getFamilyDashboard(days)`, `summaryFacts(...)`, `writeFamilySummary` → `{ data: { text: string | null } }`; guide off → `{ text: null }`.
- `POST /api/v1/guide/turns` is already open to parents with a bearer; only a test is added.

- [ ] **Step 1:** Run the `security-auditor` agent on this Interfaces block. Fold blocking findings into the steps.
- [ ] **Step 2:** Tests per route (mock services at the `@/features/<f>/server` boundary, bearer scope as the wave 2 route tests): happy path returns the service result; `child bearer → 403` and the service is not called; bad body → 400 `VALIDATION`; `POST /children` nickname taken → 409 with `fieldErrors.nickname`; no family → 403; lookup unknown → 404 with `INVITATION_GONE`; `guide/state` parent with guide off → `{ configured: false, enabledChildIds: [] }`; `guide/turns` parent bearer with `context.entry = "parent"` streams; `family/summary` guide off → `{ text: null }`.
- [ ] **Step 3:** Run `pnpm --filter @jarso/web test api/v1`. Expected: FAIL.
- [ ] **Step 4:** Implement. Each route file is a thin `withApi(..., { bearer: true })` handler; no logic past parse, role and service call. Add each to the `docs/api.md` table.
- [ ] **Step 5:** Run `pnpm check`. Expected: green.
- [ ] **Step 6:** Commit (when authorised), two commits: `feat(api): parent routes for children and invitations`, `feat(api): parent guide state, drafts and family summary`.

### Task 3: parent sign-in, roles, setup and the placeholders

One SDD task: parts in order, then one review.

#### 3a: sign-in, session roles, beforeSignOut

**Files:**
- Create: `apps/mobile/src/features/auth/{sign-in-parent,parent-sign-in-form,before-sign-out,role-home}.ts(x)`
- Modify: `apps/mobile/src/features/auth/{session-provider,index}.ts(x)`, `apps/mobile/app/(auth)/sign-in.tsx`, `apps/mobile/src/config/site.ts` (`WEB_SIGNUP_URL = "https://jarso.vercel.app/signup"`)
- Delete: `apps/mobile/app/(auth)/parents.tsx`, its references
- Test: `apps/mobile/tests/features/auth/{parent-sign-in-form,before-sign-out}.test.tsx`, `apps/mobile/tests/session.test.tsx` (update)

**Interfaces:**
- `signInParent(input: SignInInput): Promise<void>`: `signInSchema` from `@jarso/core/auth`, `supabase.auth.signInWithPassword`; any auth error → `AppError("UNAUTHORIZED", "Invalid email or password")` (the web line, no enumeration); retryable fetch error → `UNAVAILABLE` `offlineCopy.offline`. Logs only `code`/`status`.
- `SessionStatus = "loading" | "signed-out" | "unavailable" | "child" | "parent"`; `SessionValue` gains `role?: "child" | "parent"`; `userId` set for both roles. `verify()` returns `{ kind: "parent"; userId }` for `profiles.role === "parent"` (no more sign-out-and-redirect).
- `registerBeforeSignOut(fn: () => Promise<void>): () => void` (exported from `@/features/auth`); `runBeforeSignOut(timeoutMs = 5_000): Promise<void>`: all hooks via `Promise.allSettled`, each capped at `timeoutMs`, failures logged by name only. `endSession` awaits it before `supabase.auth.signOut()`.
- `homeFor(role: "child" | "parent"): Href` → `/(child)/(tabs)` or `/(parent)/(tabs)`.
- Sign-in screen: "I'm a child" / "I'm a parent" choice (child default; last choice kept in SecureStore key `jarso.sign-in-mode`), child form unchanged, parent form: Email, Password, Sign in, "New to Jarso? Create an account on the web" → `WEB_SIGNUP_URL`. Accepts `next` (from `safeNextPath`) and goes there after sign-in, else `homeFor(role)`.

- [ ] **Step 1:** Tests: `parent form shows email errors from signInSchema`; `child domain email refused`; `wrong password shows "Invalid email or password"`; `parent session sets status parent with userId`; `hung or failing hook does not block sign-out` (one hook never resolves, one throws, a third resolves and is called; sign-out completes after 5 s with fake timers); `unregister removes the hook`; `signed-in parent visiting sign-in redirects to parent tabs`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/mobile test auth session`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): parent email sign-in and roles`.

#### 3b: the `(parent)` group and role guards

**Files:**
- Create: `apps/mobile/app/(parent)/_layout.tsx`, `apps/mobile/app/(parent)/(tabs)/_layout.tsx` (tabs only; screens in Task 4), `apps/mobile/src/lib/flash.ts`
- Modify: `apps/mobile/app/(child)/_layout.tsx`, `apps/mobile/src/lib/{query,index}.ts`, `apps/mobile/src/features/news/{use-open-notice,notice-listener,inbox-list,news-screen}.tsx`
- Test: `apps/mobile/tests/app/{parent-layout,parent-tabs}.test.tsx`, `apps/mobile/tests/app/tabs.test.tsx` (child, update), `apps/mobile/tests/features/news/news.test.tsx` (update)

**Interfaces:**
- `(parent)/_layout.tsx` wraps its `Stack` in `<BodySizeProvider size="parent">`.
- Child layout: `status === "parent"` → `<Redirect href="/(parent)/(tabs)" />`. Parent layout mirrors it: loading spinner, `unavailable` → `UnavailableNotice`, `child` → `/(child)/(tabs)`, signed out → `/sign-in?next=<current path>`. Pages pushed with headers (titles from core copy); `children/[childId]/handover/[kind]/[id]` and `children/new`... as form sheets: `SHEETS = ["children/[childId]/handover/[kind]/[id]"]` (detent 0.9); the rest pages. Settings opens from a header button on every tab.
- Parent tabs: Family (`index`, `HomeIcon`), Children (`children`, `UsersIcon`), Jarso (`jarso`, `SparklesIcon`, `href: null` unless `ParentGuideState.configured`), Inbox (`inbox`, `InboxIcon`, badge = unread). Same bar style as the child tabs.
- `noticeTargetRoute(target: NoticeTarget, role: NoticeRole): Href` replaces wave 2's `noticeRoute(notice)` (callers pass `noticeTarget(notice, role)`); `useOpenNotice(role: NoticeRole)` marks read then pushes that route. Plan 3 uses both for push taps and adds no mapper of its own. Parent `handover` → `/(parent)/children/[childId]/handover/[kind]/[id]`, `child` → `/(parent)/children/[childId]`, `child-history` → `.../history`, `home` → `/(parent)/(tabs)`; child mapping unchanged. `NoticeListener`, `InboxList` and the inbox screen take `role: NoticeRole` (child passes `"child"`).
- `flash(message: string): void`: `ToastAndroid.show(message, ToastAndroid.SHORT)` plus `AccessibilityInfo.announceForAccessibility`. For the web's toasts.
- Query keys added to `keys`: `parentGuide(userId)`, `setup(userId)`, `family(userId)` (membership, family, children), `dashboard(userId, days)` (prefix `["family", userId]`), `summary(userId, days)` (prefix `["family", userId]`), `invitations(userId)`, `child(childId)` and parts sharing its prefix: `childSchedule`, `childDue`, `childGifts`, `childRequests`, `childRules`, `childHistory`, `childLearning`, `childChats`, `childTranscript(childId, conversationId)`, `childMemories`, `childGuideAccess`, `parentChats(userId)`, `parentTranscript(userId, id)`.

- [ ] **Step 1:** Tests: `parent at child group redirects to parent tabs`; `child at parent route redirects to child home`; `signed out at parent route goes to sign-in with next`; `parent tabs hide Jarso when not configured`; `inbox badge shows unread`; `noticeTargetRoute parent handover target` and the other three parent targets; `useOpenNotice("parent") marks read and routes`; child mapping unchanged.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Replace every bare `"/"` href in the app with `homeFor(...)` or a group path.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): parent route group and role guards`.

#### 3c: setup flow and payment placeholders

**Files:**
- Create: `apps/mobile/app/(parent)/setup.tsx`, `apps/mobile/src/features/setup/{use-setup,profile-step,family-step,setup-screen,index}.ts(x)`, `apps/mobile/src/components/ui/date-field.tsx`, `apps/mobile/src/features/payments/{card-payment-slot,auto-charge-slot,saved-cards-slot,index}.tsx`
- Modify: `apps/mobile/app/(parent)/_layout.tsx` (gate), `apps/mobile/package.json` (`@react-native-community/datetimepicker`), `apps/mobile/src/components/ui/index.ts`
- Test: `apps/mobile/tests/features/setup/setup.test.tsx`, `apps/mobile/tests/features/payments/slots.test.tsx`

**Interfaces:**
- `useParentSetup(): UseQueryResult<{ profileComplete: boolean; familyId: string | null }>` (key `setup(userId)`; `findParentDetails` and `findMembership`). Parent layout: until both are done every route except `setup` and `settings` redirects to `/(parent)/setup`; while the read fails, the offline notice with Retry, never a parent screen.
- Setup screen: profile step first when `!profileComplete` (`parentDetailsSchema`, Date of birth via `DateField`, Country, Gender; `upsertParentDetails`), then family step when `!familyId` (`createFamilySchema`; currency picker, timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone`; `createFamilyWithFallback`). Copy from `setupCopy` / `profileCopy`. On success invalidate `setup` and `family`, then `router.replace(next ?? "/(parent)/(tabs)")` (`next` kept through setup for the invite link).
- `DateField({ label, value: string | null, onChange(iso: string): void, minimumDate?: string, maximumDate?: string, errors?: string[] })`: ISO `YYYY-MM-DD` in and out, Android dialog picker.
- `CardPaymentSlotProps = { kind: "allowance" | "gift"; id: string; childId: string; amountMinor: number; currency: string; split?: { spendMinor: number; saveMinor: number } }` (`split` is the handover form's current cash/saved split; the server prefills when absent); `CardPaymentSlot(props): null`.
- `AutoChargeSlotProps = { target: { kind: "schedule" | "gift"; id: string } }`; `AutoChargeSlot(props): null`. `SavedCardsSlot(): null` (no props). All three exported with their prop types from `apps/mobile/src/features/payments/index.ts`; plan 4 fills them.

- [ ] **Step 1:** Tests: `setup gate clears after profile then family` (both incomplete → profile step; submit → family step; submit → replace to tabs; no second redirect); `under-18 date shows "You need to be 18 or over"`; `rejected timezone still creates the family` (data mock throws once, fallback called); `parent route redirects to setup when profile incomplete`; `slots render nothing` (all three, `split` accepted).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised), two commits: `feat(mobile): parent setup on the phone`, `feat(mobile): payment slots for plan 4`.

### Task 4: Family home, Children, Inbox and Settings

**Files:**
- Create: `apps/mobile/app/(parent)/(tabs)/{index,children,inbox}.tsx`, `apps/mobile/app/(parent)/settings.tsx`, `apps/mobile/src/features/family/{use-family,use-family-mutations,children-list,family-code,index}.ts(x)`, `apps/mobile/src/features/requests/{use-parent-requests,parent-request-items}.ts(x)`, `apps/mobile/src/features/allowance/{use-due,index}.ts`, `apps/mobile/src/features/parent/{family-home-screen,needs-you-card,timeline-card,children-screen,settings-screen,index}.tsx`
- Modify: `apps/mobile/src/features/requests/index.ts`, `apps/mobile/src/features/settings/` (theme section reused)
- Test: `apps/mobile/tests/features/parent/{family-home,children,settings}.test.tsx`, `apps/mobile/tests/features/requests/parent-request-items.test.tsx`

**Interfaces:**
- `useFamily(): { family: Family; children: ChildSummary[] }` query (key `family`); `useDashboard(days = 7)` → `getFamilyDashboard(supabase, { userId, days, now: new Date(), guideOn })`; `useFamilySummary(days)` → `apiFetch("/api/v1/family/summary?days=…", { auth: true })`, only when guide configured.
- Family home (mockup C, built from `ScreenHeader`, `Card`, `CardSeparator`, `ListRow`): date line (`todayLine()`, family timezone) over "Your family" (`text-h1`), header avatar → Settings. "Needs you" card: count badge, each open request with `requestSentence`, reason and time ago, inline Approve / Say no (decide) or the deposit/withdrawal completion buttons, then each due item (`mergeDue`) with "Hand over" → handover sheet. "All caught up." when nothing waits. Then Jarso's summary line (when present), then the timeline (core `timeline`). A child filter and the other web dashboard sections are not on the phone. Pull to refresh refetches `family` prefix.
- `useDecideRequest()`, `useCompleteRequest()`, `useRejectDeposit()`: `callDecideWithdrawal`, `callComplete`, `callDecideDeposit` from `@jarso/data/requests`; results flash the web toasts (`"Not now. We let them know."`, `"Already sorted."`, `"Handed over."`, `"Added to Save."`, `"Okay, not added."`); CONFLICT refetches. Invalidate `child(childId)`, `family`, then `dispatchNotices()`.
- Children tab: one `Card` of `ListRow`s, not cards (mockup C): initial avatar, nickname, last activity line (`text-small` muted, from the latest history item), total `text-money` and `Spend · Save` split (`text-small`, Save in gold). Row → child hub. "Add a child" button → `/(parent)/children/new`. Empty: `FirstChildCard` copy.
- Inbox tab: the news inbox with `role="parent"`; a tap goes through `useOpenNotice("parent")`.
- Settings (web `parent/settings` minus cards and push): display name (`updateProfileById`), your details (`upsertParentDetails`), family code (`family.code`, Copy and Share via `Share.share`), timezone (`updateFamilyTimezone`), per child: rename (`renameChildMember`; CONFLICT → `nicknameTaken` on the field), new PIN (`PATCH /children/:id/pin`), remove (confirm dialog, `DELETE /children/:id`, stays open with the error on failure), Jarso on/off (`saveGuideAccess`); a "Cards" section holding `<SavedCardsSlot />`; theme; Sign out. Copy from `familySettingsCopy` / `profileCopy`.

- [ ] **Step 1:** Tests: `needs you lists requests and due items, All caught up when empty`; `approve calls decide and flashes`; `already_decided flashes Already sorted`; `hand over opens the handover sheet for that item`; `children rows show total and split`; `rename taken shows nicknameTaken under the field`; `remove failure keeps the dialog open with the error`; `new PIN calls the pin route with the bearer`; `family code shows and shares`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with plan 1's tokens and screen parts; body size comes from the layout's `BodySizeProvider`.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised), two commits: `feat(mobile): parent family home, children and inbox`, `feat(mobile): parent settings`.

### Task 5: child hub, handover, history, gifts, allowance, rules, learning

One SDD task: parts in order, then one review.

#### 5a: child hub and handover

**Files:**
- Create: `apps/mobile/app/(parent)/children/[childId]/index.tsx`, `apps/mobile/app/(parent)/children/[childId]/handover/[kind]/[id].tsx`, `apps/mobile/src/features/allowance/{use-schedule,use-gifts,use-handover,handover-form,allowance-card,due-list}.tsx`, `apps/mobile/src/features/parent/{child-hub-screen,use-child}.tsx`, `apps/mobile/src/features/family/send-note-sheet.tsx`
- Test: `apps/mobile/tests/features/parent/child-hub.test.tsx`, `apps/mobile/tests/features/allowance/handover.test.tsx`

**Interfaces:**
- `useChild(childId): ChildSummary | undefined` from `useFamily()`; an id not in the family → back to Children (no read with it).
- Hub (web `children/[childId]/page.tsx`): jars (`getJars`), due allowance and gifts (`listDueForParent`), open requests (Task 4 items), allowance card (`getParentSchedule`) with `<AutoChargeSlot target={{ kind: "schedule", id }} />`, upcoming gifts (`listGiftsFor`) with "Add a gift", guide card (on/off, flagged count from `countFlaggedSince`, 30 days), learning summary, recent history (5) → History; links to history, gifts, allowance, rules, learning, guide; "Send a note" sheet (`childNoteSchema`, `insertChildNote`, one `idempotencyKey` per opening).
- `useConfirmHandover()` → `confirmHandover(supabase, input)`; `already_confirmed` shows as success; CONFLICT shows the core line and refetches. `useMarkNotGiven()` → `markNotGiven`. Both invalidate `child(childId)`, `family`, then `dispatchNotices()`.
- Handover sheet (web `handover/[kind]/[id]/page.tsx`): item from `listDueForParent` (not found → "Already sorted." and close); cash / save split prefilled with `prefillSplit(getLastSplitWith)`, plan note from `planNote(getGoalView)`; `handoverSchema(currency)`; one `idempotencyKey` per opening; Confirm; "Not given" for allowances (confirm first); `<CardPaymentSlot kind id childId amountMinor currency split={{ spendMinor: cash, saveMinor: saved }} />` under the cash form, fed the form's live split.

- [ ] **Step 1:** Tests: `double tap confirms once` (one mutation call, same key); `already_confirmed shows success`; `not_given conflict shows notGiven line`; `split must add up to the amount` (schema message); `not given asks to confirm`; `unknown child id goes back to Children`; `hub shows due, allowance, gifts and guide sections`; `note sends once per opening`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): child hub and cash handover`.

#### 5b: history, learning, rules

**Files:**
- Create: `apps/mobile/app/(parent)/children/[childId]/{history,learning,rules}.tsx`, `apps/mobile/src/features/learning/learning-summary.tsx`, `apps/mobile/src/features/rules/{use-rules,rules-form,index}.tsx`
- Modify: `apps/mobile/src/features/history/{history-list,use-history,where-it-went}.tsx` (`childId` prop, `readOnly`), `apps/mobile/src/features/learning/index.ts`
- Test: `apps/mobile/tests/features/history/history-list.test.tsx` (update), `apps/mobile/tests/features/rules/rules-form.test.tsx`, `apps/mobile/tests/features/learning/learning-summary.test.tsx`

**Interfaces:**
- `HistoryList({ childId, readOnly, header })`: `readOnly` hides undo, fix and entry detail; paging with `getHistoryPage`; "Where it went" this week with `getHistorySince` + core `whereItWent`.
- `LearningSummary({ childId })`: `getLearningOverview(supabase, childId, { timezone, now })`; check-in, path, skills, completed missions (web `learning/page.tsx`), no actions.
- `RulesForm({ childId })`: reads `findChildRules`; spend limit per period (`setRuleSchema(currency)`, `saveMoneyRule`, `amountMinor: null` switches off), jar moves (`jarMovesSchema`, `saveJarMovesApproval`), overspend (`overspendSchema`, `saveAllowNegativeSpend`). Each save invalidates `childRules` and flashes the web line.

- [ ] **Step 1:** Tests: `parent history has no undo or fix`; `child history unchanged`; `turning a limit off sends null`; `amount over the max shows the schema message`; `learning summary shows completed missions and no start button`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): child history, learning and rules for parents`.

#### 5c: allowance and gifts

**Files:**
- Create: `apps/mobile/app/(parent)/children/[childId]/allowance.tsx`, `apps/mobile/app/(parent)/children/[childId]/gifts/{new,[giftId]}.tsx`, `apps/mobile/src/features/allowance/{use-allowance-mutations,allowance-form,pause-sheet,gift-form}.tsx`
- Test: `apps/mobile/tests/features/allowance/{allowance-form,gift-form}.test.tsx`

**Interfaces:**
- Allowance screen (web `children/[childId]/allowance/**`): summary (`describe` helpers from core), set up (`allowanceSchema(currency, today)`, `createAllowance`) or change (`changeAllowanceSchema`, `changeAllowance`; `fieldErrors.nextOn` lands on the Next date field), pause (`pauseSchema(today)`, through date or open, optional message), resume, stop (confirm), `<AutoChargeSlot target={{ kind: "schedule", id }} />`.
- Gifts: new (`giftSchema(currency, today)`, `createGift`, one key per opening), edit (`updateGiftSchema`, `updateGift(db, input, today)`), cancel (confirm, `cancelGift`), `<AutoChargeSlot target={{ kind: "gift", id }} />` on edit. A gift that is no longer pending → "This gift was already handed over or cancelled." and back.
- `today` and `currency` from `getFamilyContext`. Every mutation invalidates `child(childId)` and `family`, then `dispatchNotices()`.

- [ ] **Step 1:** Tests: `change with an invalid next date shows NEXT_ON on the field`; `create when one exists shows alreadyExists`; `pause until a date sends through`; `stop asks to confirm`; `gift date in the past refused on new`; `edit keeps a due gift's past date`; `cancelled gift shows giftDone and goes back`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): allowance and gifts for parents`.

### Task 6: add a child and accept an invitation

**Files:**
- Create: `apps/mobile/app/(parent)/children/new.tsx`, `apps/mobile/app/(parent)/invite.tsx`, `apps/mobile/src/features/family/{add-child-form,invite-screen,use-invitations}.tsx`
- Modify: `apps/mobile/app/(auth)/sign-in.tsx` and `apps/mobile/src/features/setup/setup-screen.tsx` (keep `next`), `apps/mobile/app.json` (no change expected: `scheme: "jarso"` exists; confirm)
- Test: `apps/mobile/tests/features/family/{add-child,invite}.test.tsx`

**Interfaces:**
- Add child (web `children/new`): `addChildSchema` (nickname, PIN, consent), `POST /api/v1/children`; 409 `fieldErrors.nickname` on the field; success → invalidate `family`, flash, replace to the new child's hub.
- Invite screen (web `invite/page.tsx`): params `inviteParamsSchema` (`token` | `code` | `id`, one way in, same order). Unfinished setup → setup with `next` = this URL. No param: "Invitations for you" (`listInvitationsForCaller`) plus a code form. Token or code: `POST /api/v1/invitations/lookup` once, then the accept form (nickname prefilled, PIN, consent) → `POST /api/v1/invitations`. 404 → `INVITATION_GONE`. Success → child hub.
- `jarso://invite?code=ABCD1234` and `?token=…` open this screen through the existing scheme; Expo Router passes the query as params.

- [ ] **Step 1:** Tests: `invite link survives sign-in and setup` (signed out → sign-in with `next=/invite?code=…` → setup → invite screen with the code); `unknown code shows INVITATION_GONE`; `listed invitation accepts by id`; `nickname taken on accept shows field error`; `add child success opens the hub`; `add child without consent shows the schema message`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): add a child and accept invitations`.

### Task 7: Jarso for parents

**Files:**
- Create: `apps/mobile/app/(parent)/(tabs)/jarso.tsx`, `apps/mobile/app/(parent)/children/[childId]/guide/{index,[conversationId]}.tsx`, `apps/mobile/src/features/guide/{use-parent-guide,parent-thread,action-card,child-chats,guide-switch}.tsx`
- Modify: `apps/mobile/src/features/guide/{thread,use-send-turn,memory-list,index}.ts(x)` (audience prop), `apps/mobile/src/features/guide/use-guide-state.ts` (parent shape)
- Test: `apps/mobile/tests/features/guide/{parent-thread,child-chats}.test.tsx`, `apps/mobile/tests/features/guide/guide.test.tsx` (child, unchanged)

**Interfaces:**
- `useParentGuideState(): UseQueryResult<ParentGuideState>` (`GET /api/v1/guide/state`, key `parentGuide`).
- Jarso tab (web `parent/jarso`): not configured → `guideCopy.switchedOff`; no child on → the web's "Jarso is off for every child…" line with Home; else a chip per enabled child, `GuideThread audience="parent"` sending `context: { entry: "parent", childId }` through `useSendTurn` (same 52 s timeout, `clientMessageId` reuse); History list (`listChatsAskedBy`) reopens a chat (`getAskerTranscript`, `threadMessagesFrom`, turns left). Action cards: "Do it" → `POST /api/v1/guide/drafts/confirm` with the draft, outcome line, invalidate `family` and `child(childId)`.
- Child's guide (web `children/[childId]/guide/**`): `GuideSwitch` (`saveGuideAccess`, invalidate `childGuideAccess` and `parentGuide`), `listChildChats` flagged first, a chat (`getChildTranscript`; null → back), memories (`listMemories`, delete `deleteMemory`). Copy from `parentGuideCopy`.

- [ ] **Step 1:** Tests: `tab hidden when not configured` (from 3b); `parent turn sends entry parent with the chosen child`; `retry reuses clientMessageId`; `Do it posts the draft and shows the outcome`; `switch off hides the child from the chips after refetch`; `child chats flagged first`; `forget memory removes it`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): Jarso for parents on the phone`.

### Task 8: Maestro parent flows, docs and the plan check

**Files:**
- Create: `apps/mobile/e2e/{parent-sign-in,parent-approve-request,parent-cash-handover,parent-allowance,parent-add-child}.yaml`
- Modify: `docs/mobile.md` (parents on the phone, `(parent)` layout, setup gate, shared routes note, no more "use the web" screen), `docs/api.md`, `docs/auth.md` (parent password sign-in on the phone, role routing, `beforeSignOut`), `docs/architecture.md` (§8 and §9 module lists: `profiles`, `dashboard`), `docs/testing.md` (new flows and env), `CLAUDE.md` (hard rule 1 data module list), `tasks/todo.md` (wave 3 parent device checklist)

- [ ] **Step 1:** Write the flows (spec §8 minus card and push): sign in as parent and see Family; approve the seeded child's take-out request; hand over a due allowance in cash; change the allowance amount and see it on the hub; add a child with a random nickname. Credentials by `-e PARENT_EMAIL=… -e PARENT_PASSWORD=…` (and the wave 2 child vars where a flow first makes the child ask). Selectors are core copy labels.
- [ ] **Step 2:** Run `code-reviewer` and `security-auditor` on the branch; fix blocking findings.
- [ ] **Step 3:** Run `pnpm check`, `pnpm turbo lint typecheck test build` and the `verify` skill. Expected: green; `grep -rnE "text-(xs|sm|base|lg|xl|[2-9]xl)\b" apps/mobile/app apps/mobile/src` prints nothing.
- [ ] **Step 4:** On a device (user): `npx expo run:android`, then `pnpm --filter @jarso/mobile e2e` with the `-e` flags; walk every Screens-table row except saved card; tick `tasks/todo.md`.
- [ ] **Step 5:** Commit (when authorised), two commits: `test(mobile): maestro flows for parents`, `docs(mobile): parents on the phone`.

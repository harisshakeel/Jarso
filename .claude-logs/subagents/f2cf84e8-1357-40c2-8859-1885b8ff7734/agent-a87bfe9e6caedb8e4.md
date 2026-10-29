---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: a87bfe9e6caedb8e4
agent_type: general-purpose
model: opus
description: Review invitations list feature
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.372231
---

# Subagent: Review invitations list feature

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `a87bfe9e6caedb8e4` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=a87bfe9e6caedb8e4]
timestamp: 2026-10-29T02:56:26.346Z
time: 2026-10-29 02:56
chars: 1867

Review one feature in the Jarso repo (/home/ezio/Desktop/Work/8x/Jarso), read-only. The diff (3 commits, a4e5a13..c5b2a61 on base 7e2106f) is at /tmp/jarso-review/invites.diff — read it once; inspect other code only to check a concrete named risk.

Requirement (from the user): on the parent's "Accept an invitation" page (/invite), list pending child-started invitations addressed to the parent's own CONFIRMED email (case-insensitive), with a Refresh button; accept from a row via the existing nickname/PIN/consent form. Security requirements: DB function list_my_invitations() is security definer, search_path='', authenticated-only, requires caller role 'parent' and auth.users.email_confirmed_at not null, returns only pending + unexpired rows; accept-by-id must verify the id is in the caller's own list (raw ids from elsewhere rejected with the existing INVITATION_GONE message); token/code paths unchanged. Rules: CLAUDE.md hard rules (layering, barrels, server-only split, Zod on all input incl. searchParams, AppError, Cache Components: per-user reads inside Suspense, no caching), docs/database.md migration rules, docs/design.md binding for UI (list rows, empty state "mark, one sentence, one action", Button loading, parent voice, accessibility 44px/AA).

Check especially: can any caller see another family's or another email's invitations (email spoofing via unconfirmed sign-up, child role, case/whitespace tricks); TOCTOU between the id check and register_child; information leak via different errors; rate limiting where relevant; the e2e and pgTAP tests actually assert the security properties.

Do not run servers, e2e, or contact any Supabase project; you may run focused unit tests. Do not dispatch subagents. Report: spec verdict, strengths, issues ranked Critical/Important/Minor with file:line and fix, and a verdict (approved / needs fixes).


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=a87bfe9e6caedb8e4]
timestamp: 2026-10-29T02:58:13.658Z
time: 2026-10-29 02:58
chars: 7284

## Review: parent's pending-invitations list on /invite (a4e5a13..c5b2a61)

**Spec verdict: mostly met.** The database function, the id check, the server/client split, the UI and the tests all match the spec. The one gap is the "confirmed email" property: it is only as strong as the Supabase project's email-confirmation setting, and nothing in the repo enforces or documents that dependency. Family unit tests pass (`pnpm vitest run src/features/family`: 7 files, 90 tests). I did not run e2e or pgTAP.

### Strengths
- **`list_my_invitations()`** (`supabase/migrations/20261029025041_list_my_invitations.sql`):
  - It is `security definer`, `search_path=''`, and only `authenticated` can execute it (`public` and `anon` are revoked).
  - It keys on `auth.uid()` joined to `auth.users` and `profiles`, so the caller cannot supply any input.
  - It checks `email_confirmed_at`, `role='parent'`, pending status and expiry, and compares emails with `lower()` on both sides. It never returns the email, and it caps at 50 rows.
  - The partial index expression matches the query.
- **Role can't be faked.** `profiles.role` comes from `raw_app_meta_data` only (family_core.sql:15-37), and users can't update the role column. A child, or a user who sets metadata at sign-up, cannot become a parent.
- **No TOCTOU problem.** `register_child` locks the invitation `for update` and re-checks pending and unexpired. Between the id check and the insert, an invitation can only become accepted or expired, never re-addressed. The `NOT_FOUND` from that race is mapped to `INVITATION_GONE`, and the orphan child auth user is deleted (unit test included).
- **Same error everywhere.** Foreign, used and non-UUID ids all give `INVITATION_GONE`, including the Zod uuid message (`schemas.ts:495`). `?id=` is parsed with Zod and dropped if it isn't a UUID. Token and code paths are unchanged, and the page takes token, then code, then id.
- **Layering is correct.** Route → service → repository; the RPC call lives only in `repository.ts`; server-only exports go through `server/index.ts`; the list is read per request inside the existing Suspense with no caching.
- **UI follows `docs/design.md`.**
  - Empty state is the mark, one sentence and one action (Refresh).
  - Buttons are `h-11` (44px).
  - Refresh uses `loading` with `useTransition`.
  - Screen readers hear "Accept Ava" and "Refresh invitations".
  - Timestamps use `<time dateTime>`, and the section has `aria-labelledby`.
- **pgTAP covers the main cases:**
  - anon gets 42501
  - case-insensitive match, newest first
  - expired, accepted and another parent's invitations excluded
  - unconfirmed email and child role see nothing
  - a session with no user id sees nothing
  - the parent still can't read the `invitations` table directly
  - 50-row cap

### Issues

**Critical:** none.

**Important**
1. **The confirmed-email check does nothing when Supabase auto-confirms, and the hosted setting it relies on is not documented.**
   - `supabase/config.toml:227` has `enable_confirmations = false`. With that, sign-up sets `email_confirmed_at` straight away.
   - So on any stack configured like this, someone can sign up as a parent with an unregistered address that isn't theirs (e.g. `[email redacted]`). They then see that address's pending invitations (child nicknames) and can accept them into their own family.
   - With auto-confirm, an email change via `updateUser` may also apply immediately. I believe that is how GoTrue behaves but did not verify it. If so, the same thing works through `updateUser({ email })`.
   - The e2e test only passes because of this: see the comment at `tests/e2e/onboarding.spec.ts:48`, where the parent sees the list right after sign-up without confirming.
   - **Fix:** in the `docs/auth.md` hosted checklist (around lines 54-69), add a required item: "Authentication → Providers → Email → Confirm email: **on** (`list_my_invitations` depends on it)", and keep "Secure email change" on as well. Mention the dependency in the `docs/database.md:40` entry.
   - Optionally, set `enable_confirmations = true` locally and have the e2e confirm through the admin API, as `email-confirm.spec.ts` already does, so the property is tested end to end.

**Minor**
2. **pgTAP doesn't assert the function's properties** (`supabase/tests/database/list_my_invitations.test.sql`). Add a check like `select is((select prosecdef and proconfig @> '{search_path=""}' from pg_proc where proname='list_my_invitations'), true, …)`, plus a `function_privs_are` / `has_function_privilege` check that `authenticated` can execute it. A future `create or replace` that drops these would otherwise go unnoticed.
3. **The e2e only checks the id path on the page, not in the action** (`tests/e2e/onboarding.spec.ts:1209-1217`). Rejecting a foreign id in `acceptListedInvitationAction` is covered only by a mocked unit test (`service.test.ts:816`). That is acceptable, but the e2e should also check that Otto's invitation is still pending and acceptable by code after Dana's session tried it.
4. **Invitations past the 50-row cap can't be accepted by id** (`service.ts` `findMyInvitation`). The id is checked against the capped list, so an older invitation beyond 50 shows "Gone". This doesn't matter in practice; noting it so the cap isn't raised or removed without thinking about it.
5. **`acceptListedInvitation` calls `assertRole("parent")` twice** (once in `requireFamilyId`, again inside `listMyInvitations`). `getRole` is cached, so the cost is negligible. It could pass the client and skip the second check.
6. **Accept button style in list rows** (`invitation-list.tsx:336-341`). `docs/design.md:175` says list buttons are `ghost`; this uses the primary style. Primary is defensible because it's the only action in the row, but it's a deviation from the doc.
7. **No rate limit on the list or accept-by-id paths.** I think this is fine: both need a signed-in, confirmed parent, the query is cheap and indexed, and the id check can't be used to discover other people's invitations. If anything, add `/invite` refreshes to the existing per-parent limit later.

**Already in main, not from this diff, for awareness:** `register_child(…, p_invitation_id)` is callable by any `authenticated` user and does not tie the invitation to the caller's email. That is by design, because the token and code paths accept invitations sent to any address. So "id must be in the caller's own list" is enforced in the service layer. A direct RPC call would also need an unlinked child-role profile id plus an unguessable invitation UUID, so the risk is low.

### Verdict
**Needs fixes:** one Important item. Fix #1 (at least the docs/hosted-config requirement); the Minor items are optional. The code itself is sound and could be approved once #1 is addressed.

Key files:
- /home/ezio/Desktop/Work/8x/Jarso/supabase/migrations/20261029025041_list_my_invitations.sql
- /home/ezio/Desktop/Work/8x/Jarso/supabase/config.toml (line 227)
- /home/ezio/Desktop/Work/8x/Jarso/docs/auth.md (hosted checklist, lines 54-69)
- /home/ezio/Desktop/Work/8x/Jarso/src/features/family/server/service.ts
- /home/ezio/Desktop/Work/8x/Jarso/supabase/tests/database/list_my_invitations.test.sql
- /home/ezio/Desktop/Work/8x/Jarso/tests/e2e/onboarding.spec.ts

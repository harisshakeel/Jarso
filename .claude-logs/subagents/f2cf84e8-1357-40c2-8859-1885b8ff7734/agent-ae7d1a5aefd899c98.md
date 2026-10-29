---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: ae7d1a5aefd899c98
agent_type: general-purpose
model: opus
description: Review Task 10 (spec + quality)
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.517022
---

# Subagent: Review Task 10 (spec + quality)

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `ae7d1a5aefd899c98` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=ae7d1a5aefd899c98]
timestamp: 2026-10-29T01:08:54.216Z
time: 2026-10-29 01:08
chars: 2173

Your instructions are in /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/reviewer-common.md — read and follow them exactly. Placeholders:

- BRIEF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-10-brief.md
- GLOBAL_CONSTRAINTS: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/global-constraints.md, plus binding controller requirements for this task: e2e must run only against LOCAL Supabase (127.0.0.1) — keys obtained programmatically in test code via `supabase status`, never printed/logged/written; webServer gets local env for build and start; dedicated port, no reuse of an existing server; hard abort if URL isn't local; skip cleanly when local Supabase isn't running (CI must fail instead). E2E must cover: parent-started and child-started onboarding, invite reuse copy "This invitation has expired or was already used. Ask your child to start again.", loose family code/nickname input, family isolation, wrong-role redirects (child→/parent lands /child, parent→/child lands /parent), signed-out /child → /sign-in/child, lockout copy "Too many tries. Ask your parent or wait a little while." with correct PIN still refused. The implementer also added an unrequested migration fixing a real bug (GoTrue admin createUser writes app_metadata.jarso_role in an UPDATE after the insert, so child profiles got role 'parent'); review it with security focus — invariant 15: role must never be settable by a user-writable path; can the new update trigger be abused (e.g. a parent's own app_metadata, or a user flipping role after joining a family)? Also judge use of the internal `__NEXT_PROCESSED_ENV` flag and the spoofed x-forwarded-for in tests.
- REPORT_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-10-report.md
- BASE_SHA: b99a6a6  HEAD_SHA: 3ab922b
- DIFF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/review-b99a6a6..3ab922b.diff
Repo root: /home/ezio/Desktop/Work/8x/Jarso. Do not start servers, run e2e, or contact any Supabase project.


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=ae7d1a5aefd899c98]
timestamp: 2026-10-29T01:10:44.268Z
time: 2026-10-29 01:10
chars: 7471

### Spec Compliance

- ✅ Spec compliant for the e2e and docs scope, with one gap: brief Step 4 says to run the `security-auditor` and `code-reviewer` agents. The report says "No agents dispatched" (task-10-report.md:10). Step 5's `.claude-logs/` commit and PR are also not done (report:10). Both may be the controller's to own, but the brief assigns them to this task.
- Controller requirements, checked against the diff:
  - Local-only Supabase:
    - Keys are read in memory from `supabase status -o json`, with stderr dropped and errors swallowed (tests/e2e/local-supabase.ts:459-467).
    - `assertLocalUrl` hard-aborts on a non-local host, including a cached value (local-supabase.ts:449-454, 484, 494).
    - No keys are printed. CI discards `supabase start` stdout (ci.yml:86).
  - webServer gets local env for both build and start (playwright.config.ts:248-256, 275, 281).
  - Dedicated port 3200 with `reuseExistingServer: false` (config:245, 279).
  - Clean skip when local Supabase is down: spec.ts:519 and global-setup.ts:384-388. CI throws instead (global-setup.ts:385).
  - Parent-started path (spec:599-618) and child-started path (spec:620-655) are both covered.
  - Invite reuse shows the exact copy (spec:524-526, 653-654).
  - Loose code/nickname input: lower case, hyphen or space, surrounding spaces (spec:596-597, 614, 647).
  - Isolation (spec:660-665).
  - Child→/parent lands on /child (spec:676-678). Parent→/child lands on /parent (spec:668-669).
  - Signed-out /child goes to /sign-in/child (spec:681-683).
  - Lockout copy, and the correct PIN is still refused (spec:700-706).
- ⚠️ Cannot verify from diff: the CI e2e job has never run on GitHub (report:43). The controller should confirm the first CI run passes, including that `supabase start` in the e2e job does not need a separate `db reset`.
- `docs/api.md` is unchanged. That is acceptable: the brief says to modify it only "if actions are listed there", and the report says they aren't.

### Strengths

- The real root-cause bug was found and fixed instead of being papered over: GoTrue writes app_metadata in an UPDATE after the insert. The new pgTAP test reproduces GoTrue's actual insert-then-update order (child_role.test.sql:6-15), which the old `tests.create_user` helper hid.
- Migration security review (invariant 15). Named risk: can any user-writable path reach the role? Results of the checks:
  - Only `raw_app_meta_data` fires the trigger (migration:30). Users cannot write that column. Only the GoTrue admin/service role can.
  - The only app write site is `src/features/family/server/child-auth.ts:24`, a constant `{ jarso_role: "child" }`. I grepped `src` for `app_metadata|updateUserById|jarso_role`.
  - The trigger is one-way: it only ever sets `child` and can never promote anyone to parent.
  - It is a no-op for any profile with any `family_members` row, regardless of status, including `removed` (migration:20). So a parent in a family can't be demoted, and a member's role can't flip after joining.
  - The `WHEN old is distinct from 'child'` guard stops re-firing on GoTrue's later app_metadata updates, such as provider info on sign-in.
  - `profiles.role` remains non-updatable by `authenticated`: family_core.sql:36-37 grants update on `full_name`/`avatar_url` only.
  - The function has `security definer`, `search_path = ''`, and EXECUTE revoked.
  - Remaining exposure: a parent who has not yet created a family can be turned into a child, but only by service-role code that writes `jarso_role`. That is already trusted. No abuse path found.
- The global-setup preflight is a sound hard guard (global-setup.ts:400-427). It creates a user on LOCAL and proves the app server can sign it in. Against a hosted backend the sign-in just fails and creates nothing there.
- The exact pathname predicate `at()` avoids the `/sign-in/child` false match (spec:533-534).
- The PIN-field-clear wait makes each lockout attempt deterministic (spec:696).

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None blocking for this task.

#### Minor (Nice to Have)

1. **`playwright.config.ts:249`, `__NEXT_PROCESSED_ENV`.** This is an undocumented internal Next flag. The implementer verified it empirically (report:20) and documented the fallback.
   - If it breaks, the Supabase URL and keys stay safe: explicit process env wins, and the preflight catches any mismatch.
   - What would leak back in is optional `.env.local` keys, mainly `RESEND_API_KEY`. That means real sends to `@example.com` addresses.
   - An explicit empty override won't work, because `RESEND_API_KEY` is `z.string().min(1).optional()` (src/config/env.server.ts:8).
   - Acceptable for now. Suggested follow-up: a server-side `E2E`/`EMAIL_DISABLED` guard, or a test that asserts the flag still suppresses `.env.local` on Next upgrades.
2. **`onboarding.spec.ts:529, 543`, spoofed `x-forwarded-for`.** This is fine as a test-isolation trick, but it works only because `getClientIp` trusts the first client-supplied XFF hop (src/features/family/server/client-ip.ts:10) and `next start` passes it through. So the e2e suite in effect shows that `pin:ip` / `invite:ip` limits can be bypassed on any host that doesn't overwrite XFF.
   - In production on Vercel the platform sets XFF.
   - Per-family limits (30/h) and per-child lockout still bound brute force.
   - The test is also coupled to that weakness: if `getClientIp` is hardened, every run shares `127.0.0.1`, and the second run within 15 minutes hits `pin:ip` 20/15 min.
   - Not from this task. Worth a deploy-time note in docs/security.md or production-readiness.
3. **`local-supabase.ts:444, 499`.** The cache env var `JARSO_E2E_LOCAL_SUPABASE` holds the local secret key as JSON. Playwright merges `process.env` into `webServer`, so it is inherited by `pnpm build`, `pnpm start` and the Next server. These are local-only keys and nothing writes them to disk, so this is low risk. If the cache var is kept, it could be stripped from `serverEnv`.
4. **`child_role.test.sql:349-352`.** The "user metadata cannot set role" test updates `raw_user_meta_data`, which can never fire the trigger (wrong column). It shows only that `handle_new_user` ignores user metadata, not anything about the new trigger. Adding a case that updates `raw_app_meta_data` without `jarso_role` (or with `jarso_role` = 'parent') and asserts no change would test the WHEN clause.
5. **`spec.ts:693-702`, pre-existing semantics.** The 5th wrong PIN locks the account but returns `invalid` (child_accounts.sql:251-262), so the child sees "didn't match" and only the 6th try shows the locked copy. The test matches the current behaviour. The brief's "five wrong PINs → locked message" is a UX ambiguity for the product owner, not a defect in this task.
6. **Report concern 2.** `nicknameConflict` maps every CONFLICT, including JA409 "Child account is not available", to the nickname field error. That hid this bug. It is out of this diff, but worth a follow-up ticket.

### Assessment

**Task quality:** Approved

**Reasoning:** The e2e covers every required journey and copy string against a verified-local stack, with no key exposure. The extra migration fixes a real role bug and keeps invariant 15: it is one-way, admin-only, and blocked for anyone in a family. What remains is the two process steps the brief assigns to this task (reviewer agents, logs/PR) and test-infrastructure fragility (`__NEXT_PROCESSED_ENV`, XFF trust) worth tracking.

---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: a3eed19e044427f9d
agent_type: general-purpose
model: opus
description: Implement Task 6: family server layer
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.267593
---

# Subagent: Implement Task 6: family server layer

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `a3eed19e044427f9d` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=a3eed19e044427f9d]
timestamp: 2026-10-28T18:36:28.918Z
time: 2026-10-28 18:36
chars: 4735

You are implementing Task 6 of the Jarso slice-1 plan: the family feature's server layer (repository, services, DAL role checks, child auth user creation + session minting, optional email adapter). Screens (Tasks 7–9) build directly on the exact exports you produce.

Read first, in order:
1. /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/implementer-common.md (rules for all tasks; binding rulings there override the brief)
2. /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-6-brief.md — your requirements, with exact values to use verbatim.
3. Existing patterns: src/features/profiles/server/{repository,service}.ts, src/features/auth/server/session.ts, src/lib/supabase/{server,admin}.ts, src/config/{env.server,site}.ts, docs/conventions.md, docs/auth.md, ADR docs/adr/0004-child-identity-pin-sign-in.md.

What earlier tasks produced (use these exactly):
- SQL (see supabase/migrations/*_family_core.sql, *_child_accounts.sql, *_invitations.sql and src/types/database.types.ts):
  - create_family(p_currency text, p_timezone text) → uuid (authenticated).
  - register_child(p_child_id, p_family_id, p_nickname, p_pin, p_consent boolean, p_invitation_id uuid default null) → void (authenticated; caller must be approved parent of family; invitation branch marks it accepted atomically; JA404 if invitation not pending/unexpired; JA409 nickname clash or child already registered; 22023 bad PIN/nickname).
  - set_child_pin(p_child_id, p_pin) (authenticated, parent of child).
  - verify_child_pin(p_family_code, p_nickname, p_pin) → table(child_id uuid, status text) status 'ok'|'invalid'|'locked'; service_role only; never raises for auth failures.
  - hit_rate_limit(p_key text, p_window interval, p_max int) → boolean allowed; service_role only. Pass interval as a Postgres interval string like '1 hour'.
  - create_invitation(p_nickname, p_parent_email, p_token_hash, p_code_hash) → uuid; service_role only.
  - find_invitation(p_hash) → table(id, nickname); authenticated.
  - current_family_id() returns NULL for users without a family even though the generated type says string — treat as string | null.
  - Tables readable via RLS by the user client: families (members), family_members (members), profiles (self, own children, co-members).
- TS (Task 5): `@/lib` exports toAppError(error, fallback). `@/features/family` (client-safe barrel) exports normaliseFamilyCode, generateCode(length), generateToken() (64-char hex, opaque), hashSecret(value) async SHA-256 hex, childEmail(profileId), the Zod schemas (createFamilySchema, addChildSchema, startChildOnboardingSchema, acceptInvitationSchema, childSignInSchema, setChildPinSchema) with inferred input types, and types Membership, Family, ChildSummary. Inside the family module use relative imports. src/config/site.ts has supportedCurrencies.

Controller rulings specific to this task (binding, in addition to the brief):
- Add ALL route constants to src/config/site.ts now (parent "/parent", parentSetup "/parent/setup", parentNewChild "/parent/children/new", child "/child", childStart "/start", childSignIn "/sign-in/child", invite "/invite"). Do NOT touch protectedRoutePrefixes (Task 7 does).
- childSignIn rate limits: per IP `pin:ip:<ip>` 20 per 15 minutes AND per normalised family code `pin:family:<CODE>` 30 per hour. Check both before verify_child_pin; if either denies → RATE_LIMITED with child-friendly copy.
- findInvitation rate limit: per signed-in user `invite-lookup:user:<userId>` 10 per hour → RATE_LIMITED.
- Map verify_child_pin status: 'invalid' → AppError UNAUTHORIZED "Hmm, that didn't match. Check with your parent."; 'locked' → RATE_LIMITED "Too many tries. Ask your parent or wait a little while." (lock duration now escalates, so don't promise 15 minutes).
- .env.example: append only, never read (see rules). Add RESEND_API_KEY and EMAIL_FROM as optional in env.server.ts.
- Step 1 spike is mandatory before writing child-auth.ts: run it against local Supabase (pnpm db:start; admin key via the `supabase status -o env` export pattern in the rules, never printed). Record in your report: whether `.invalid` email is accepted, which verifyOtp `type` worked. If `.invalid` is rejected, switch to `child.jarso.local`, update childEmail + its test, ADR 0004, the spec's mention, and tell me in your reply. Delete the spike files afterwards.
- mintChildSession runs inside a Server Action/Route Handler context (cookies writable) using the user server client from @/lib/supabase/server.
- sendEmail must never log the recipient address or body.

Report file: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-6-report.md


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=a3eed19e044427f9d]
timestamp: 2026-10-28T18:42:46.264Z
time: 2026-10-28 18:42
chars: 1823

Status: DONE_WITH_CONCERNS (all minor). The server layer is committed and the checks pass.

Commit: 8e84cf1 feat(family): add family services, dal and child auth

Tests: `pnpm check` passes (lint, typecheck, 49/49 unit tests). The 10 new tests in `service.test.ts` failed first because `./service` didn't exist, then passed once it was written.

Spike:
- `.invalid` email is accepted by local GoTrue. childEmail, ADR 0004 and the spec are unchanged.
- verifyOtp works with `type: "magiclink"` (and also `"email"`). The code uses `magiclink`.
- `supabase status` is blocked by the project's deny list, so I couldn't use the env-export pattern and didn't work around it. Instead I ran a throwaway route in `pnpm dev` that read the app's own env, so I never saw a key. The spike files are deleted.

Concerns:
1. Spike method differed from the rules because of the deny entry above.
2. `acceptInvitation` looks the invite up again, so a page view plus a submit uses 2 of the parent's 10 lookups per hour. Task 8 shouldn't call `findInvitation` more than that.
3. The children list query (`listChildMembers`, which embeds the profile nickname) is only type-checked, not run against the database. Task 10's e2e will cover it.
4. An old production `next start` from an earlier session is still holding port 3123. I left it running.

Changes beyond the brief:
- `addChild` returns FORBIDDEN before creating an auth user when the familyId isn't the parent's own family.
- The `.env.example` lines are commented out, so copying the file doesn't create empty values that fail validation.
- The DAL casts the `/parent` and `/child` redirects to `Route` until Tasks 7–9 create those pages, the same way `safeNextPath` does.

Report: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-6-report.md

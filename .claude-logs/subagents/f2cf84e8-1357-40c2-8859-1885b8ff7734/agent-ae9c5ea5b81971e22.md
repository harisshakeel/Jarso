---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: ae9c5ea5b81971e22
agent_type: general-purpose
model: opus
description: Re-review final fix wave
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.527120
---

# Subagent: Re-review final fix wave

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `ae9c5ea5b81971e22` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=ae9c5ea5b81971e22]
timestamp: 2026-10-29T01:57:04.834Z
time: 2026-10-29 01:57
chars: 2222

Your instructions are in /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/rereview-common.md — read and follow them exactly. Placeholders:

- BRIEF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/final-fix-brief.md
- REPORT_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/final-fix-report.md
- FIX_BASE_SHA: d513fa3  HEAD_SHA: f8c9c8c
- DIFF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/review-d513fa3..f8c9c8c.diff (165 KB, 11 commits; read in passes)
- FINDINGS: every item A–J in the brief file is a finding to verdict (A: child password bypass + session revocation + password rotation + parent login rejects child domain; B: Zod bounds; C: login ?error prototype crash + db-error hasOwn; D: PIN autocomplete off; E: --input border ≥3:1; F: per-(child, source) lockout, per-(code, ip-hash) family limiter, global 100/24h cap, audit child.locked, never-raise preserved; G: parent_email nulled on accept, hashed limiter keys; H: nickname charset in Zod+SQL, fixed email subject, normalised email key, invite:global 200/day; I: Resend pattern in three scanners; J1–J7). Respect the brief's "Deferred (do NOT do)" list.
Specific security checks: revoke_user_sessions is service_role-only and only reachable after parent authz; verify_child_pin still never raises and keeps timing equalisation; new table child_pin_attempts has RLS on/no policies/revoked grants; the profiles update restriction actually blocks child-role users (check the policy/grant mechanism); find_invitation no longer executable by authenticated; no new open-redirect or PII-in-logs. Also give your view on the implementer's open question: does rotating the child's password on every PIN sign-in (admin updateUserById) sign the child out of their other devices in GoTrue? Check GoTrue behaviour from any source available offline (node_modules @supabase/auth-js docs/types, Supabase docs via the Context7 MCP tool if available); say clearly if you cannot determine it.
Repo root: /home/ezio/Desktop/Work/8x/Jarso. Do not start servers, run e2e, or contact any Supabase project.


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=ae9c5ea5b81971e22]
timestamp: 2026-10-29T02:00:30.559Z
time: 2026-10-29 02:00
chars: 11311

### Finding Verdicts

- **A: child password bypass, session revocation, password rotation, parent login rejects child domain.** ADDRESSED.
  - Rotation: `rotateChildPassword` at child-auth.ts (admin `updateUserById` with `generateToken()`). `childSignIn` calls it after verify returns ok and before `mintChildSession` (service.ts, end of `childSignIn`). `setChildPin` runs `assertParentOf` → `updateChildPin` → `rotateChildPassword` → `revokeUserSessions(admin)` (service.ts, last function).
  - `revoke_user_sessions` (migration L15-31) is security definer and deletes from `auth.sessions`. Grants: revoked from public, anon and authenticated; granted only to service_role (migration grants block at the end). Its only caller is `setChildPin`, after `assertParentOf`. pgTAP covers 42501 for authenticated, the refresh token cascade, and that other users' sessions are untouched.
  - Parent login: `signInSchema.email = parentEmail`, which refuses `@child.jarso.invalid` case-insensitively (auth/schemas.ts). Tests cover mixed case.
  - `config.toml`: `secure_password_change = true`. The hosted step is in docs/auth.md.
- **B: Zod bounds.** ADDRESSED.
  - `childSignInSchema`: familyCode `.max(16)` before trim, nickname max 20, pin `^\d{4,6}$`.
  - `inviteValue` max 128 is used by `acceptInvitationSchema`.
  - `inviteParamsSchema` (preprocess first value, `.catch(undefined)`) is used in invite/page.tsx `InviteContent`.
  - Tests are in family/schemas.test.ts.
- **C: `?error=__proto__` crash and db-error lookup.** ADDRESSED.
  - `loginLinkError` uses `typeof === "string" && Object.hasOwn`, and login/page.tsx calls it.
  - db-error.ts `toAppError` uses `Object.hasOwn(mapped, code)`.
  - Tests cover `__proto__`, `constructor`, `toString`, `hasOwnProperty` and an array value.
- **D: PIN autocomplete off.** ADDRESSED. `autoComplete="off"` on the PIN fields in add-child-form, accept-invitation-form and set-pin-form.
- **E: `--input` border at least 3:1.** ADDRESSED.
  - globals.css: light `oklch(0.64 0.012 85)`, dark `oklch(0.565 0.046 220)`. design.md §2 and §13 are updated.
  - I recomputed the ratios with oklab → sRGB → WCAG: light is 3.36 on white and 3.08 on paper (`--background` 0.97/0.007/89); dark is 3.10 on card and 3.78 on background. The implementer's numbers match.
- **F: per-(child, source) lockout, per-(code, ip-hash) family limiter, global 100/24h cap, `child.locked` audit, never-raise kept.** ADDRESSED.
  - `child_pin_attempts` has RLS on, no policies, and `revoke all … from anon, authenticated` (migration L37-58). pgTAP shows a parent gets 42501 on both read and delete.
  - `verify_child_pin` has the new 4-argument signature. It has no `raise` anywhere. The dummy `crypt(gen_salt('bf',10))` still runs for an unknown family or nickname. The `child_credentials … for update` row lock still serialises attempts across all sources.
  - Per-source lock: 5 failures → 15 min × 2^(n-1), capped at 24 h.
  - Cross-source cap: 100 failures freeze the child (`frozen_at`). `set_child_pin` and `register_child` clear all attempt rows and the cap.
  - Audit: `child.locked` with `scope` source or all, `actor_id` null, no IP or PIN. pgTAP asserts no source or PIN appears in `details`.
  - The family limiter key is `pin:family:${familyCode}:${ipHash}` (service.ts `childSignIn`).
  - Counters were migrated, not kept, and the choice is documented.
- **G: `parent_email` nulled on accept, hashed limiter keys.** ADDRESSED.
  - `parent_email` drop not null, and `register_child` sets `parent_email = null` on accept. pgTAP checks for `/none`.
  - `pin:ip`, `invite:ip` and `invite:email` all use `hashSecret`. The retention TODO is in docs/database.md.
- **H: nickname charset, fixed subject, normalised email key, `invite:global` 200/day.** ADDRESSED.
  - Zod uses `^[\p{L}\p{Nd} _.'-]+$` after NFC. SQL uses `[[:alpha:][:digit:] _.''-]` in both `register_child` and `create_invitation`. pgTAP shows `Zoë O'Neil-2` is accepted, so Postgres `[[:alpha:]]` is Unicode-aware locally.
  - Subject is fixed to "Your child wants to join Jarso".
  - `normaliseEmailForLimit` exists and has tests.
  - `invite:global` is set to 1 day / 200. Note the amplification issue under New Breakage.
  - Using `\p{Nd}` instead of the brief's `\p{N}` is a justified deviation.
- **I: Resend pattern in three scanners.** ADDRESSED. `\bre_[A-Za-z0-9_]{20,}` is in extract-log.py REDACTIONS, check-secrets.sh and a .gitleaks.toml `[[rules]]` entry. The rule has not been run under gitleaks itself (not installed locally), as the implementer disclosed.
- **J1: accept race maps to INVITATION_GONE.** ADDRESSED. `acceptInvitation` re-throws NOT_FOUND with `INVITATION_GONE`, and there is a unit test.
- **J2: stale "wait 15 minutes" copy.** ADDRESSED. db-error.ts JA423 now reads "wait a little while".
- **J3: forms keep nickname and consent after a failed submit.** ADDRESSED. Both forms use controlled `useState` fields and a controlled `Checkbox checked/onCheckedChange`. The PIN stays uncontrolled, so it clears.
- **J4: timezone falls back to UTC.** ADDRESSED. `createFamily` catches VALIDATION and retries `insertFamily` once with "UTC". There is a test for the retry and one showing other errors are not retried.
- **J5: children cannot write `profiles.full_name`.** ADDRESSED.
  - The only update policy (from create_profiles.sql) is dropped and replaced with `using/with check (id = auth.uid() and role = 'parent')`.
  - The column grant is still `update(full_name, avatar_url)`, so `role` itself can't be changed by clients, and `role` is set only from app_metadata.
  - pgTAP shows a child's update changes 0 rows.
- **J6: `find_invitation` no longer executable by authenticated.** ADDRESSED. It was already revoked from public and anon (invitations migration L355-358). The new migration revokes it from authenticated and grants it to service_role. `findInvitation` calls it through the admin client only after `assertRole("parent")` and the per-user limit. Covered by pgTAP (42501) and a service test ("refuses non-parents before any lookup").
- **J7: `x-forwarded-for` trust documented.** ADDRESSED in docs/security.md under "Client IP".

### Open question: does rotating the child's password sign out the child's other devices?

**Yes, it does.** I read upstream supabase/auth master (fetched from GitHub; this is not in node_modules):
- `internal/api/admin.go` `adminUserUpdate` calls `user.UpdatePassword(tx, nil)` whenever a password is supplied.
- `internal/models/user.go` `UpdatePassword` with `sessionID == nil` runs `Logout(tx, u.ID)`, which deletes all of the user's sessions. It also runs `ClearAllOneTimeTokensForUser`.

So in this branch:
- Every PIN sign-in on device B kills device A's refresh token. A is signed out once its access token expires (at most 1 h).
- In `setChildPin`, the rotation alone already ends every session. `revoke_user_sessions` is redundant there; it is harmless as a belt-and-braces step.
- The e2e revocation test therefore cannot tell which of the two did the revoking. pgTAP covers the RPC by itself.
- docs/auth.md says GoTrue "may" end other sessions. It should say "will".

### New Breakage in the Fix Diff

- **Important: one child can't stay signed in on two devices.** service.ts `childSignIn` calls `rotateChildPassword` before mint. Given the GoTrue behaviour above, a child who uses a phone and a family tablet signs the other device out on every sign-in. The fix works as specified (ruling A2), but this cost wasn't visible when the ruling was made. The controller should choose one of:
  - accept the cost and fix the docs;
  - rotate only on PIN reset, and rely on the Password Verification hook plus `secure_password_change`;
  - re-rule.
- **Important: `invite:global` can be used to block /start for everyone.** `enforceLimits` records a hit on every limit even when another limit denies, and `hit_rate_limit` increments before it compares (child_accounts.sql L285-292). One client on one IP sending 200 POSTs to /start uses up `invite:global` for the day: its per-IP 5/h limit refuses those requests but they still count toward the global cap. No IP rotation is needed. Cheap fix: check `invite:global` only after the per-IP and per-email limits pass (sequential `enforceLimits`).
- **Minor: two simultaneous PIN sign-ins can fail one device.** Rotation clears all one-time tokens for the user (`ClearAllOneTimeTokensForUser`). If device B's rotation lands between device A's `generateLink` and its `verifyOtp`, A's magic-link token is wiped and A gets INTERNAL. Rare, and a retry fixes it.
- **Minor: password strength settings could break child sign-in.** `generateToken()` (64 lowercase hex characters) goes through GoTrue `checkPasswordStrength` on every child sign-in and PIN reset. If the hosted project turns on character-class requirements (uppercase or symbols), every child sign-in and PIN reset would fail with INTERNAL. Child creation already had this exposure; the fix makes it hot-path. Either note "keep password requirements at default" in docs/auth.md Hosted setup, or generate a mixed-class token.
- **Minor: the cross-source window is fixed, not sliding.** The 24 h window starts at the first failure, so near a window boundary up to about 198 guesses fit inside a short span. Acceptable at 4–6 digit PINs and pilot scale.
- **Minor: non-Latin names with combining marks are rejected.** `\p{L}` and `[[:alpha:]]` exclude combining marks (`\p{M}`), so names typed in Devanagari, Thai and similar scripts (for example "नेहा") fail validation even though they are real names. This follows from the brief's charset; flagging it for the product owner.
- **Minor: docs wording.** docs/auth.md and the child-auth.ts JSDoc say GoTrue "may" end sessions; per upstream it does.

### Out-of-Scope Observations

- `verify_child_pin` returns `locked` (and `frozen`) early without spending bcrypt time. This is the same pattern as before; the status already reveals that the child exists, so the timing adds nothing new.
- `getClientIp` falls back to `"unknown"`. Every client without the header would share one lockout source and limiter bucket. That can't happen on Vercel; it matters for self-hosting only, which docs/security.md now flags.
- Implementer concern 3 still stands: `revoke_user_sessions` needs `postgres` to have DELETE on `auth.sessions` on the hosted project. Confirm at the first `db push`. Because of the GoTrue behaviour above, `setChildPin` would still have revoked sessions before the RPC failed; the parent would just see INTERNAL after a PIN change that actually succeeded.

### Verdict

**Fix round:** All findings A–J addressed. Two Important items are new in the fix diff and need a controller decision before merge:
1. Rotating the password on every PIN sign-in signs the child's other devices out, which is now confirmed GoTrue behaviour (decide or re-rule A2, then fix the "may" in the docs).
2. One client can exhaust `invite:global` because denied requests still count; order the limit checks so the global cap is only hit after the per-IP and per-email limits pass.

Diff reviewed in passes (migration, then service/repository/schemas, then UI/CSS/scanners, then pgTAP/e2e/docs). The only computations I ran were the contrast-ratio checks; the GoTrue behaviour comes from the upstream source.

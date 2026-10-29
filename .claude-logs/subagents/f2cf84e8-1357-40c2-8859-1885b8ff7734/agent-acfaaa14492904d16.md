---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: acfaaa14492904d16
agent_type: general-purpose
model: opus
description: Review Task 10a/10b (spec + quality)
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.469850
---

# Subagent: Review Task 10a/10b (spec + quality)

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `acfaaa14492904d16` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=acfaaa14492904d16]
timestamp: 2026-10-29T01:19:27.965Z
time: 2026-10-29 01:19
chars: 1545

Your instructions are in /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/reviewer-common.md — read and follow them exactly. Placeholders:

- BRIEF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-10ab-brief.md
- GLOBAL_CONSTRAINTS: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/global-constraints.md plus CLAUDE.md rules (Zod on all external input incl. route params; AppError; logger, never log tokens/emails; env only via config; Next 16 APIs). Security focus for /auth/confirm: open redirect via `next` (the implementer parses the full RedirectTo URL from the email template and accepts only request/app origin — check for bypasses: protocol-relative, backslashes, encoded slashes, userinfo@host, different port, javascript:), token handling/logging, replay behaviour, type enum restriction. For 10b: `await connection()` placement in getCurrentUser and that it doesn't break Cache Components static shells or "use cache" callers (grep callers). Docs: hosted setup instructions must not contain any real project ref/URL/key.
- REPORT_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-10ab-report.md
- BASE_SHA: 3ab922b  HEAD_SHA: 8b7e7cb
- DIFF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/review-3ab922b..8b7e7cb.diff
Repo root: /home/ezio/Desktop/Work/8x/Jarso. Do not start servers or contact any Supabase project.


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=acfaaa14492904d16]
timestamp: 2026-10-29T01:20:50.073Z
time: 2026-10-29 01:20
chars: 5780

### Spec Compliance

- ✅ Spec compliant. Every item in 10a and 10b is present:
  - `connection()` is the first statement of `getCurrentUser`, with the comment (session.ts:517-519). The docs line is at docs/auth.md:70.
  - `/auth/confirm` route (route.ts:11-28) with a Zod `type` enum of email|signup (schemas.ts:444-448).
  - `routes.authConfirm` (site.ts:413).
  - Template plus config.toml entry (config.toml:546-548). `enable_confirmations` is untouched.
  - Login copy for `auth_confirm` and `auth_callback` (login/page.tsx:234-238).
  - Unit tests covering every case the brief lists (route.test.ts).
  - Hosted setup docs (auth.md:109-126) and an e2e test (email-confirm.spec.ts).
  - The sign-up action still sends `/auth/callback?next=…` (actions.ts:483-488), so Task 8's `next` is preserved through unwrapping.
- ⚠️ Cannot verify from the diff:
  - Whether GoTrue redirect-URL matching really needs `**` to match `?next=` (deploy.md:147). The controller should confirm this against GoTrue's allowlist glob semantics.
  - Hosted dashboard steps are manual and still outstanding (the report says so).

### Strengths
- The open-redirect design is sound for most bypass classes. I replicated `nextFromEmailLink` and ran it in node; these all fall back to `/dashboard`:
  - a foreign origin
  - a different port (`http://localhost:3001/x`)
  - userinfo pointing elsewhere (`http://localhost:[email redacted]/`)
  - `javascript:` (origin "null" is never allowed)
  - protocol-relative `//evil.com`
  - a top-level `/\evil.com`, or `/\t/evil.com` (the URL parser normalises these into a foreign host, which is rejected)
  - encoded slashes (`/%2F%2Fevil.com` stays same-origin and encoded)
- Token handling is clean. Logs carry only `{code, status}` or "malformed", never the token or email (route.ts:391-393).
- A malformed query never calls `verifyOtp` (tests at route.test.ts:341-350).
- Replay is covered end to end: reusing the link lands on `/login` with the message (email-confirm.spec.ts:624-628).
- Placement of `connection()` (10b) is safe:
  - Checked `getCurrentUser` callers: only session.ts and family/server/dal.ts, and no `"use cache"`, `unstable_cache`, `after()` or `dynamic = "error"` anywhere in src.
  - Checked the throw paths in node_modules/next/dist/server/request/connection.js. It throws only for the cache, unstable-cache, after and build-time scopes, none of which are used. In action and route-handler request scopes it is a no-op.
- Docs contain no Supabase project ref or key. `https://jarso.vercel.app` was already in deploy.md:145 and is a public app URL, not a secret.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
1. **Open redirect through control characters in the unwrapped callback `next`** (src/features/auth/schemas.ts:464-468, used by src/app/auth/confirm/route.ts:389).
   - In the `/auth/callback` unwrap branch, `url.searchParams.get("next")` percent-decodes the value, and the result goes straight to `safeNextPath`. That function only checks the prefixes `/`, `//` and `/\`.
   - So `/%09/evil.com` decodes to `"/\t/evil.com"`, which passes the check. Then `new URL("/\t/evil.com", origin)` strips the tab, making `//evil.com`, which resolves to `http://evil.com/`.
   - Verified in node with the replicated function:
     - input: `next=http://localhost:3000/auth/callback?next=%2F%09%2Fevil.com`
     - `nextFromEmailLink` returns `"/\t/evil.com"`
     - the redirect goes to `http://evil.com/`
     - `%0A` behaves the same way
   - Exploit: an attacker signs up with their own email, takes their valid `token_hash`, and wraps it in this link. A victim who clicks it is signed into the attacker's account on the Jarso domain, then bounced to an attacker site. That is a credible phishing chain.
   - The same root cause already exists in `/auth/callback` (src/app/auth/callback/route.ts, `safeNextPath(searchParams.get("next"))` followed by `new URL(next, origin)`). The `signIn` redirect also uses `safeNextPath`.
   - Fix at the root, in `safeNextPath`. Reject any ASCII control character or whitespace (`/[\x00-\x1F\x7F]/`), or resolve with `new URL(next, "http://x")` and require the origin to stay `http://x`. Then add `callbackRedirect("/\t/evil.com")` and a `/%0A/` variant to the unsafe-next `it.each` in route.test.ts:330-339.

#### Minor (Nice to Have)
1. src/app/(auth)/login/page.tsx:247-248: `?error` is looked up on a plain object without validation.
   - `?error=constructor` (or `toString`) returns a prototype function. It passes `FormError`'s `!message` check (src/components/form/field.tsx:54) and gets rendered as a React child (React warning, nothing shown).
   - CLAUDE.md rule 9 also asks for Zod on params.
   - Fix: parse with `z.enum(["auth_confirm","auth_callback"]).safeParse(error)`, or guard with `Object.hasOwn`.
2. src/app/auth/confirm/route.ts:388: `new URL(clientEnv.NEXT_PUBLIC_APP_URL).origin` is recomputed on every request. It could be a module constant. Trivial.
3. tests/e2e/email-confirm.spec.ts:591: skips when local Supabase is absent, including in CI. This matches onboarding.spec.ts:12, so it is consistent. The CI protection depends on global-setup failing first; check that the new `auth` project can't pass silently as skipped.

### Assessment

**Task quality:** Needs fixes

**Reasoning:** Both tasks are implemented as briefed. 10b's `connection()` is correctly placed and safe for every current caller, and the confirm route's origin check holds against the listed bypass classes. However, the callback-unwrap path inherits `safeNextPath`'s control-character gap, which is a confirmed, reproducible open redirect after a successful `verifyOtp`. Fix it in `safeNextPath`, which also closes the same hole in `/auth/callback`, and add regression cases.

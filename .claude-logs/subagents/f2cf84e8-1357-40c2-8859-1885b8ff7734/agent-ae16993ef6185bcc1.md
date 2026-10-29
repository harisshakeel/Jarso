---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: ae16993ef6185bcc1
agent_type: general-purpose
model: opus
description: Review Task 7 (spec + quality)
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.497462
---

# Subagent: Review Task 7 (spec + quality)

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `ae16993ef6185bcc1` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=ae16993ef6185bcc1]
timestamp: 2026-10-28T19:17:34.193Z
time: 2026-10-28 19:17
chars: 1744

Your instructions are in /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/reviewer-common.md — read and follow them exactly. Placeholders:

- BRIEF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-7-brief.md
- GLOBAL_CONSTRAINTS: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/global-constraints.md; docs/design.md is BINDING for every screen (the user explicitly requires it: tokens, type, layout §5, components §6, motion §8, voice §9 — parent copy plain and calm, role emphasis §10, accessibility §11); CLAUDE.md rules (Cache Components: request-time reads inside Suspense, layouts don't await session; barrels; actions via createAction + assertRole/assertParentOf; no business logic in app/). Controller rulings for this task: /parent, /child, /invite added to protectedRoutePrefixes; /dashboard is a role redirect (no membership+parent → /parent/setup, parent → /parent, child → /child); createFamilyAction honours a safe `next` (safeNextPath), default /parent; timezone from Intl in a client component; currency default from navigator.language region mapped to supportedCurrencies else GBP; consent checkbox label "I am this child's parent or guardian"; sign-up rejects @child.jarso.invalid.
- REPORT_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-7-report.md
- BASE_SHA: 51adb35  HEAD_SHA: 7731e55
- DIFF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/review-51adb35..7731e55.diff
Repo root: /home/ezio/Desktop/Work/8x/Jarso. Do NOT start any server or contact Supabase (the app's env points at a hosted project).


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=ae16993ef6185bcc1]
timestamp: 2026-10-28T19:19:43.961Z
time: 2026-10-28 19:19
chars: 7676

### Spec Compliance

✅ Spec compliant for everything I could verify from the diff:
- Step 1: `signUpSchema` rejects `@child.jarso.invalid`, case-insensitively, at src/features/auth/schemas.ts:748-755. Tests are at schemas.test.ts:715-731.
- Routes and prefixes: `/parent`, `/child` and `/invite` were added to `protectedRoutePrefixes` (site.ts:548-553). The proxy matcher uses `prefix` or `prefix/`, so `/sign-in/child` and `/start` stay public. I checked src/proxy.ts:5-6.
- Dashboard role router (dashboard/page.tsx:90-93): `requireRole("parent")` sends a child to `/child` and a signed-out user to login. I confirmed this in dal.ts:36-41. A parent goes to `/parent` with a membership, otherwise to `/parent/setup`. The session read is inside Suspense.
- Actions (server/actions.ts):
  - All three use `createAction`.
  - `createFamilyAction` uses `assertRole("parent")` and `redirect(safeNextPath(next, routes.parent))` (:251-258).
  - `addChildAction` uses `assertRole` and `redirect` (:260-275).
  - `setChildPinAction` uses `assertParentOf` (:277-280). It has no refresh, which is fine because nothing on screen changes.
  - `redirect` survives `createAction` because lib/action.ts:65 calls `unstable_rethrow`.
- Setup form:
  - The currency default comes from `navigator.language` through `currencyForLocale`, and GBP is the fallback (currency.ts:1201-1210).
  - The timezone comes from `Intl` in a client component, read with `useSyncExternalStore`, so there is no hydration mismatch (create-family-form.tsx:916-925).
- Add child: nickname, PIN with `inputMode="numeric"`, and the consent label exactly "I am this child's parent or guardian" (add-child-form.tsx:798-820).
- Parent home:
  - Family code card titled "Give this code to your child" (family-code-card.tsx:1024).
  - Children list with the switcher and a Reset PIN sheet.
  - "Add a child" and "Accept an invitation" links.
- `ChildSwitcher` props are `{ children: ChildSummary[]; activeChildId?: string }` (child-switcher.tsx:849).
- Layouts: parent/layout.tsx is static. Every page's session read sits inside `<Suspense>`.
- Barrels: `@/features/family` exports the `"use server"` actions the same way `@/features/auth/index.ts` does, and no deep cross-module imports remain.

⚠️ Cannot verify from diff:
- **Consent stamping:** `addChildAction` validates `consent` but does not pass it on. `consent_at` and `consent_by` must be set inside `register_child`, which is Task 6 SQL. `consent_by` does appear in supabase/migrations/20261028182342_child_accounts.sql. The controller should confirm `register_child` stamps both fields.
- **Invite token loss:** adding `/invite` to protected prefixes in this task means a signed-out parent opening `/invite?token=…` reaches `/login?next=/invite` and loses the token, because proxy.ts:17 passes `pathname` only. Task 8 must fix this, either in the proxy or by keeping the search string.
- **Smoke test against the hosted project (Concern 1 in the report):** this is a process issue, not a code issue. The implementer drove sign-ups against the hosted Supabase project, not a local stack. This likely created one unconfirmed `smoke…@gmail.com` user and sent a confirmation email to a third-party gmail address. The user needs to delete that auth user, and future implementer briefs should forbid builds and smoke tests against `.env.local`.

### Strengths
- The authorization layering is correct.
  - The actions re-assert role and parentage before calling services that assert again.
  - `addChild` returns FORBIDDEN without a membership.
  - A CONFLICT from the service becomes a nickname field error with `cause` kept (actions.ts:1266-1271).
- `createFamilyAction` validates `next` with Zod and sanitises it with `safeNextPath`, so there is no open redirect.
- Browser values are read with `useSyncExternalStore` and a server snapshot, so there is no effect and no hydration mismatch. Submit stays disabled until the timezone is known.
- `currencyForLocale` uses `Intl.Locale().maximize()`, so `ja` maps to JPY. Bad input falls back safely, and the table test covers the edge cases (currency.test.ts).
- Design work:
  - `@/components/form` moves `Field` into a shared module, adds the error icon, and wires the helper text into `aria-describedby` (§6/§11). The docs barrel table was updated.
  - The `rise-in` utility follows §8 exactly, and reduced motion now zeroes `animation-delay` (globals.css:422), so nothing stays hidden during a delay.
  - The 36 px `sm` button appears only in the parent list. The switcher uses `aria-current` as the non-colour signal. Reset PIN has an sr-only "for {nickname}".

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None in code. The hosted-Supabase side effect above needs the user's action. It is a process finding, not a code defect.

#### Minor (Nice to Have)
1. **Possible redirect loop** at src/app/(app)/parent/page.tsx:207. When a membership exists but `getFamily()` returns null (RLS mismatch), the page redirects to `/parent/setup`. setup/page.tsx:337 sees the membership and redirects back to `/parent`, so the two pages loop. Fix: throw `AppError("NOT_FOUND"/"INTERNAL")` instead of redirecting.
2. **Empty state shows two actions** (parent/page.tsx:226-243). Its comment says "one action", and design.md §6 Empty state says "one action". It renders two: primary "Add a child" and outline "Accept an invitation". The brief requires both links on home, so either move "Accept an invitation" below the card or fix the comment.
3. **PIN fields may trigger password suggestions.** add-child-form.tsx:804 and set-pin-form.tsx:1105 use `autoComplete="new-password"` on PIN fields. Chrome may offer a generated strong password, or save the child PIN as the parent's site credential. Consider `autoComplete="off"` (or `one-time-code`).
4. **Consent error wording on a parent screen.** The error copy comes from the Task 6 schema (schemas.ts `consent`): "A parent needs to say yes first". The parent is the one reading it, so it reads oddly. Something like "Tick the box to confirm you're this child's parent or guardian" would fit §9's plain parent voice better.
5. **`cn` import is inconsistent.** child-switcher.tsx:843 imports `cn` from `"cn"`. Other feature code, including family-code-card.tsx:999, uses `@/lib`.
6. **`ProfileCard` is now unused.** The dashboard no longer renders it, and a grep finds no consumer outside `features/profiles/components`. Delete it or leave a note for later.
7. **Case-insensitive rejection is untested.** The sign-up schema test does not cover an uppercase `[email redacted]`, which the implementation handles.
8. **Title punctuation is inconsistent.** The H1 "Your family" (parent/page.tsx:303) has no full stop, while "Set up your family." and "Add a child." do.
9. **Copy-failure message is a toast** (family-code-card.tsx:1016). §6 says toasts are "never for errors that need action". The message is mild, so this is borderline.

Checks I ran:
- `cn` package: `"cn"` is a real dependency (package.json:32) and the ui primitives use it, so the import is not broken.
- Button sizes: `default` and `lg` are h-11 and `sm` is h-9 (button.tsx:33-35). The Select trigger is h-11 (select.tsx:43).
- Consent value: Base UI Checkbox submits the native "on", which matches the `consent` union in the schema.

### Assessment

**Task quality:** Approved

**Reasoning:** Every brief requirement and controller ruling is in the code, with correct authz layering, Suspense placement, safe `next` handling and design-token use. The remaining findings are minor polish. Separately, the user must clean up the hosted-project user created by the implementer's smoke test.

---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: a8beb259e25f5e197
agent_type: general-purpose
model: opus
description: Review Task 8 (spec + quality)
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.379326
---

# Subagent: Review Task 8 (spec + quality)

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `a8beb259e25f5e197` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=a8beb259e25f5e197]
timestamp: 2026-10-28T19:26:07.090Z
time: 2026-10-28 19:26
chars: 1752

Your instructions are in /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/reviewer-common.md — read and follow them exactly. Placeholders:

- BRIEF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-8-brief.md
- GLOBAL_CONSTRAINTS: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/global-constraints.md; docs/design.md is BINDING for every screen (child voice §9 on /start; parent voice on /invite; components §6; accessibility §11); CLAUDE.md rules; invariant 16 (child-started onboarding collects only nickname + parent email). Controller rulings for this task: getClientIp() = first x-forwarded-for value, else x-real-ip, else "unknown", in src/features/family/server, reusable; proxy keeps the query string in `next` so /invite?token=… survives login, safeNextPath still blocks open redirects (tests); addChild/acceptInvitation take `consent: boolean` and the repository passes it to p_consent (no hardcoded true); findInvitation called at most once per page render. Judge also: the implementer notes the sign-up path (login "Sign up" link and confirmation email redirect) drops `next`, so a brand-new parent arriving via an invite link loses the token — the child-started flow with a new parent is a core first-milestone path; decide its severity.
- REPORT_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/task-8-report.md
- BASE_SHA: 7731e55  HEAD_SHA: f484a3e
- DIFF_FILE: /home/ezio/Desktop/Work/8x/Jarso/.superpowers/sdd/2026-10-28-slice-1-family-onboarding/review-7731e55..f484a3e.diff
Repo root: /home/ezio/Desktop/Work/8x/Jarso. Do NOT start any server or contact Supabase.


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=a8beb259e25f5e197]
timestamp: 2026-10-28T19:27:20.411Z
time: 2026-10-28 19:27
chars: 6701

### Spec Compliance

- ✅ Spec compliant for everything that can be checked from the diff. Steps 1, 2, 4 and 5 are implemented. All four controller rulings are met:
  - **getClientIp:** `src/features/family/server/client-ip.ts:855-859` tries the first x-forwarded-for value, then x-real-ip, then returns "unknown". It is exported from the server barrel (`server/index.ts:868`).
  - **Login keeps the query string:** `src/proxy.ts:1126,1131` puts `pathname + search` into `next`. New tests in `src/features/auth/schemas.test.ts:434-437` show that `safeNextPath` still blocks `//evil.com/...` and `https://evil.com/...`.
  - **Consent is passed through:** the hardcoded `true` is gone. `repository.ts:907` sends `p_consent: args.consent`, carried via `service.ts:1069,1099` and `actions.ts:771`.
  - **One lookup per render:** `findInvitation` runs once per render at `invite/page.tsx:204`, after the membership check.
- Invariant 16 holds. `/start` collects only `nickname` and `parentEmail` (`start-onboarding-form.tsx:624-641`, `schemas.ts startChildOnboardingSchema`).
- The share card's copy matches the brief exactly (`invite-share-card.tsx:570-574`). It shows the code in large type (`:579-582`) and has a link copy button (`:587`).
- `/invite` covers every case:
  - Expired, used or unknown invitation: shows the brief's exact copy through `INVITATION_GONE` (`service.ts:1045`, `page.tsx:212-219`).
  - Parent with no family: sends them to `/parent/setup?next=<encoded /invite?token=…>` (`page.tsx:187-196`). I checked that the setup page and `CreateFamilyForm` honour `next` through `safeNextPath` (`parent/setup/page.tsx:21-23`, `create-family-form.tsx:44`).
  - No token: shows a code field (`:199`).
  - Accept form: nickname prefilled and editable, PIN, consent (`accept-invitation-form.tsx`). Success redirects to `/parent` (`actions.ts:796`).
- Two deviations, both acceptable:
  - The page lives at `src/app/(app)/invite/page.tsx`. The URL is the same and it picks up the app header with sign-out.
  - `?code=` works as well as `?token=`.
- ⚠️ Cannot verify from the diff:
  - Step 3, the manual end-to-end check, was not run. It is deferred to Task 10's e2e test, so the controller should make sure that test covers start → copy link → sign in → accept → child listed.
  - Whether email is sent only when RESEND_API_KEY is set lives in the existing `startChildOnboarding` service, which this diff does not change.

### Strengths

- The duplicate-nickname handling is factored into one helper, `nicknameConflict` (`actions.ts:756-764`), shared by `addChildAction` and `acceptInvitationAction`. No logic is duplicated.
- One message, `INVITATION_GONE`, covers unknown, expired and used invitations, so none can be told apart. The page and the action share it.
- The page checks for a family before calling `findInvitation`, so a parent without a family does not use up rate-limit budget. The service test asserts the same (`service.test.ts:1014-1019`).
- The service tests check the exact arguments passed to `registerChild`, including `consent` and `invitationId`. They also cover NOT_FOUND creating no auth user, and the auth user being removed when registration is rejected (`service.test.ts:949-1019`). These test real behaviour.
- Accessibility:
  - Focus moves to the share card title when it appears (`invite-share-card.tsx:552-554,569`).
  - Error notices use `role="alert"` plus an icon and words, so colour is never the only signal (`page.tsx:267-269`).
  - Tap targets are 44 px.
  - There is one keycap per child screen, and the parent screen uses the default primary button.
- The 8-character code is split 4+4 so it fits on narrow screens. Typed spaces are harmless because codes are normalised.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)

1. **A brand-new parent loses the invite token when they sign up.** This is a gap in the flow rather than in this diff.
   - `src/features/auth/components/sign-in-form.tsx:40` links to `routes.signup` without `next`.
   - `src/features/auth/server/actions.ts:19-26`: `signUp` ignores `next`, and `emailRedirectTo` is a bare `/auth/callback`. The callback (`src/app/auth/callback/route.ts:11`) supports `next`, but nothing passes it.
   - After sign-up the new parent ends up on dashboard → parent setup → `/parent`, without the invitation.
   - **Severity: Important, not Critical.** The child-started flow mainly serves parents who have no account yet, so this is the core first-milestone path. It can be recovered: the email tells the parent to "sign in or create a parent account, then open this link" (`service.ts:121-122`), the child's screen shows the code, and `/parent` has an "Accept an invitation" button that leads to the code form.
   - **Fix:** a small follow-up before the Task 10 e2e work.
     - Pass `next` from the login page to the sign-up link.
     - Add a hidden `next` to `SignUpForm` and to `signUpSchema`.
     - Set `emailRedirectTo` to `/auth/callback?next=<safeNextPath(next)>`.
     - When sign-up gives an immediate session, redirect to `safeNextPath(next)`.
     - The setup page already carries `next` onward.
   - It is outside Task 8's file list, so it should be its own task or a fix commit, not a reason to reject this task.

#### Minor (Nice to Have)

1. `src/app/(app)/invite/page.tsx:169-183`: `token` and `code` from searchParams get only a trim, not Zod, which is a little short of CLAUDE.md rule 9. The values are only hashed, so the risk is low. A small `z.string().trim().max(64)` would bound the input.
2. `invite/page.tsx:244`: "The 8-letter code" is wrong, because the alphabet includes the digits 2-9. Use "8-character code".
3. Every reload of `/invite?token=…` costs one lookup out of 10 per hour per parent, and each submit costs another (`page.tsx:201-204` plus `service.ts acceptInvitation`). The implementer noted this. It is acceptable at this scale.
4. The `consent` transform (`schemas.ts:698-700`) can only ever produce `true`. The `boolean` type and the `consent: false` test (`service.test.ts:958-970`) only exercise the type path. This is fine under the ruling and noted for clarity.
5. The implementer admits there was no separate failing (RED) test run for the consent change. That is a process gap only; the tests now assert exact arguments.

### Assessment

**Task quality:** Approved

**Reasoning:** Task 8 meets the brief, the invariants and all four controller rulings, with good layering, accessibility and real-behaviour tests. The one significant gap is that sign-up drops `next`. It sits in the auth module outside this task's scope and can be recovered with the code, but it should be fixed as a follow-up before the e2e milestone.

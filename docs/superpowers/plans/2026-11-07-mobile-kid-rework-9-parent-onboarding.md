# Mobile Kid Rework, Plan 9: Parent sign-up and onboarding on the phone (plus the child's QR sign-in and PIN pad) Implementation Plan

> **Status: built, not committed** (2026-11-07, worktree `agent-abe86e8fd7f43a253`, branch `worktree-agent-abe86e8fd7f43a253`). Commit steps record the intended split; nothing is committed until the user says so.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent can create their Jarso account and set up their family entirely on the phone, in seven short steps:

1. Welcome and role pick ("I'm a parent", "I'm a kid", "I have an account · Sign in").
2. "How Jarso works": three swipe cards (Two jars · They ask, you hand over · A mission a day).
3. Account: email, password, name; the email is checked with a code typed in the app when the project asks for one; then "Your child calls you" with the parent's details (ADR 0008) and the family's currency.
4. Add a child: nickname, PIN, consent, and "Only a nickname. No email, surname or birthday."
5. Pocket money: the existing allowance editor (plan 7 adds the Spend/Save split inside it).
6. How much freedom: three presets mapped onto the existing rules.
7. A share card: family code, nickname, a QR code, "PIN: the one you picked". The PIN is never shown again.

And the child signs in by scanning that QR (code and nickname filled in) and typing the PIN on a big pad.

**Architecture:** Pure rules and every word go in core with Vitest tests: the email code schema (`auth`), the child sign-in link (`family/sign-in-link.ts`: build and strict parse), the freedom presets (`rules/presets.ts`: preset → the writes onto a new child's defaults) and a new composite module `packages/core/src/setup` (the seven steps and the flow's copy). The phone's `features/setup` grows from "details, then family" into the whole flow: pre-session screens (welcome, how it works, account, email code) on new routes `app/(auth)/welcome.tsx` and `app/(auth)/sign-up.tsx`, and post-session steps inside the existing `/(parent)/setup` route (about you, family, child, pocket money, freedom, share). The child's sign-in form in `features/auth` gets a QR scanner (`expo-camera`) and a PIN pad. No migration, no new route handler, no new data function: sign-up is supabase-js `signUp` / `verifyOtp` / `resend`; the rest reuses `complete_parent_profile`, `create_family`, `POST /api/v1/children`, `create_allowance`, `set_money_rule`, `set_jar_moves_approval` and a `profiles.child_facing_name` update (column grant from migration `20261106120000`).

**Tech Stack:** Expo 58, React Native 0.88, NativeWind 4, react-native-svg 15, `expo-camera` (new, native), `qrcode` (new, pure JS), supabase-js 2, TanStack Query 5, Jest + RNTL (mobile), Vitest (core), Maestro.

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` ("Onboarding → Parent (7 steps)", "Onboarding → Child" step 1, "Money actions" on `child_facing_name`, "Data and backend implications → Mobile sign-up"). Mockup: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html` section 1 (P1–P7) and C1.

## Roadmap (this is plan 9 of 10)

1. Foundation (merged). 2. Progress backend (merged). 3. Child shell and Home (merged). 4. Jar pages and goal (merged). 5. Learn and the daily check-in (merged). 6. Diary, Jarso tab, Me, bell, level-up (merged). 7. Allowance split (in parallel, another worktree). 8. Child onboarding (merged). **9. Parent sign-up and onboarding** (this plan). 10. Parent restyle (merged).

## Decisions

1. **Sign-up works whether or not the project asks for an email check.** `supabase.auth.signUp` returns a session when confirmations are off (the hosted project today, and local): the session provider picks it up and the flow goes on to "About you". When confirmations are on it returns no session: the phone shows "Check your email" and the parent types the code from the email, which `verifyOtp({ email, token, type: "email" })` turns into a session. Resend is `auth.resend({ type: "signup" })`, with a 60 s wait (the hosted `max_frequency`). The code field takes 6 to 8 digits: the repo sets `otp_length = 6` for production, but the hosted project is 8 until the user runs `supabase config push`, and the phone must work either way. Every sign-up failure shows one calm line (no account enumeration, as on the web); an address already registered with confirmations on gets "Check your email" and no email (Supabase's own obfuscation), so the code screen also offers "Already have an account? Sign in".
2. **One confirmation template with both a link and a code.** Supabase has one "Confirm signup" template per project. `supabase/templates/confirmation.html` keeps the web's `/auth/confirm` link and adds `{{ .Token }}` as a code for the phone. Applying it needs custom SMTP first (docs/auth.md, hosted step 2); until then the phone flow only works with confirmations off, which is how hosted is set.
3. **"Your child calls you" is saved after the session exists, with the parent's details.** It is a `profiles` column, and nothing can be written before sign-in. So it sits on step 3's "About you" screen (chips Mum, Dad, Mama, Papa, Other…, optional) above the ADR 0008 details form, and is written right after the details save. A failed write is logged and never blocks: every child screen falls back to "your parent". The dots show step 3 for account, code and about-you alike.
4. **Steps 4–7 run only for a family made in this run, and never with a `next`.** The setup screen remembers whether it opened with the family missing. If so, after the family is created it moves on to add a child, pocket money, freedom and share; otherwise it redirects as before. A `next` (an invite link opened before setup) skips 4–7 and goes to `next` as today, because that parent's child is joining by invitation. If the app is closed during 4–7 the parent lands on Family next time, whose empty state already offers "Add a child" (accepted: no resume state).
5. **Pocket money is the existing editor.** Step 5 renders `AllowanceForm` from the `@/features/allowance` barrel inside a thin wrapper with "Not now". Plan 7 (in another worktree) adds the Spend/Save split inside `AllowanceForm`, so the split appears in step 5 once both merge. This plan does not touch `apps/mobile/src/features/allowance`, `packages/core/src/allowance` or allowance data.
6. **Freedom presets are writes onto a new child's defaults** (all rules off, jar moves `ask`), "When Sam saves or uses savings":
   - **Ask me every time** ("Best to start", the default): nothing to write.
   - **Small ones: just tell me** ("Under ₹50 goes through"): `withdrawal_auto_approve` per item = cap and `deposit_auto_confirm` per item = cap, jar moves stay `ask`. A take-out under the cap is approved at once (it still waits for the parent's handover, which is how the parent hears of it); a put-in under the cap posts at once. Over the cap the child still asks. Cap: 50 INR, 500 JPY, 5 in the other currencies (`smallCapMinor`).
   - **Sam decides** ("You get a note"): jar moves `notify` (recorded at once under any caps, a `jar_moved` notice to the parent).
   Rejected for "small": jar moves `notify` plus a `withdrawal_cap`, because `create_withdrawal` refuses over the cap instead of asking. Fine-tuning stays in Rules.
7. **The QR holds `jarso://sign-in?code=<family code>&nickname=<nickname>`, nothing else.** Never the PIN, a token or an id. It is exactly what the share card prints, so a leaked QR exposes two of the three sign-in factors (the same as a photo of the card). The PIN still guards the account, behind the per-IP and per-source rate limits and the lockout (`verify_child_pin`). The scanner parses strictly (`parseChildSignInLink`): scheme and path must match, the code is normalised and must be 4–16 code characters, the nickname must pass the nickname rule, and every other parameter (`pin`, `next`) is ignored, so a crafted QR can't redirect or pre-fill a PIN. The custom scheme also lets the stock camera open the app on the sign-in screen with both filled in. Rejected: an https link to the web (needs app links and would put the nickname into server logs).
8. **The PIN pad replaces the PIN text field on the child's sign-in.** Big keys (`keycap-white`, testIDs `pin-key-<digit>`), dots for the digits typed (4 to 6), Delete. The family code and nickname stay text fields (the scanner fills them). "Remember me on this phone" stays.
9. **A fresh phone opens on Welcome.** Layouts still send a signed-out phone to `/sign-in`; the sign-in screen sends it on to `/welcome` only when no sign-in choice was ever saved on this phone, no notice is waiting (a notice means someone was signed in) and no QR details came with the link. Welcome's "I'm a kid" and "I have an account" save that choice, so Welcome never shows again on that phone. The sign-in screen's parent mode links to sign-up.
10. **Camera permissions are minimal.** The `expo-camera` plugin is configured with `recordAudioAndroid: false` and `microphonePermission: false` (a children's app records nothing). Denied permission shows a calm line and the child types the code instead.

## Global Constraints

- **Never commit until the user says so** (lessons, memory). Commit steps record the intended split: one focused Conventional Commit per task, subject ≤ 60 chars, no AI attribution.
- **No Docker, no `supabase db reset`, no `db push`, no `config push`, nothing against the linked project.** The config and template are edited in the repo; the user applies them (Open issues).
- **Parallel plan 7.** Do not modify `apps/mobile/src/features/allowance/**`, `packages/core/src/allowance/**`, `packages/data/src/allowance/**` or allowance migrations. Step 5 imports `AllowanceForm` and `useFamilyContext` from `@/features/allowance` only.
- CLAUDE.md hard rules: core purity (rule 18), barrels, money in integer minor units, Zod for every input (sign-up, code, QR text), Biome only, `logger` (never log an email, password, code, PIN or the QR text).
- **Child data minimal.** Adding a child asks for nickname, PIN and consent only, and says so on the screen. The QR carries no secret.
- **Copy.** Parent copy calm and short (headings ≤ 6 words, labels 1–3 words). The child's sign-in copy simple and encouraging. Every string in core.
- Mobile tests in `apps/mobile/tests/` mirroring `src/`; core tests in `packages/core/tests/<module>/`. Scoped runs while building, one `pnpm check` at the end.

## Review Focus

1. **Both sign-up shapes.** A session from `signUp` goes straight on; no session shows the code screen; a good code signs in; a bad code shows one calm line; resend waits 60 s (Task 3 tests).
2. **No secret in the QR.** `childSignInLink` never takes a PIN; `parseChildSignInLink` drops `pin` and `next` and refuses other schemes, paths and bad nicknames (Task 1 tests).
3. **The PIN is never shown again.** The share step gets the child's id and nickname only; the PIN leaves state once the child is added (Task 5 test: no PIN text on the share card).
4. **The freedom preset writes only what it says.** "Ask" writes nothing; "small" writes two per-item rules; "free" writes jar moves `notify` (Task 1 and Task 5 tests).
5. **Invite links keep today's path.** With `next`, setup ends at `next` after the family step (existing tests kept).

---

### Task 1: Core: email code, sign-in link, freedom presets, setup steps and copy

**Files:**
- Modify: `packages/core/src/auth/schemas.ts` (append `emailCodeSchema`, `EMAIL_CODE_LENGTH`)
- Create: `packages/core/src/family/sign-in-link.ts`; modify `packages/core/src/family/index.ts` (one export line)
- Create: `packages/core/src/rules/presets.ts`; modify `packages/core/src/rules/index.ts` (one export line)
- Create: `packages/core/src/setup/{index,steps,copy}.ts`; modify `packages/core/package.json` (`"./setup"`)
- Test: `packages/core/tests/auth/email-code.test.ts`, `packages/core/tests/family/sign-in-link.test.ts`, `packages/core/tests/rules/presets.test.ts`, `packages/core/tests/setup/setup.test.ts`

**Interfaces:**
```ts
// auth
export const EMAIL_CODE_LENGTH = 6;
export const emailCodeSchema: z.ZodType<string>; // spaces dropped; 6 to 8 digits
// family/sign-in-link.ts
export type ChildSignInLink = { familyCode: string; nickname: string };
export function childSignInLink(details: ChildSignInLink): string; // jarso://sign-in?code=KQ74MX&nickname=Sam
export function parseChildSignInLink(text: string): ChildSignInLink | null;
// rules/presets.ts
export const FREEDOM_PRESETS = ["ask", "small", "free"] as const;
export type FreedomPreset = (typeof FREEDOM_PRESETS)[number];
export function smallCapMinor(currency: string): number;
export type FreedomWrites = { jarMoves: JarMovesMode | null; rules: MoneyRule[] };
export function freedomWrites(preset: FreedomPreset, capMinor: number): FreedomWrites;
// setup
export const PARENT_STEPS = ["welcome", "how", "account", "child", "money", "freedom", "share"] as const;
export type ParentStep = (typeof PARENT_STEPS)[number];
export function parentStepNumber(step: ParentStep): number;
export const CHILD_CALLS_YOU = ["Mum", "Dad", "Mama", "Papa"] as const;
export const setupFlowCopy: { welcome, how, account, verify, about, child, money, freedom, share, stepLabel, back, next, skip };
```

- [x] **Step 1: Write the failing tests:** email code (`"123456"`, `"123 456"` → `"123456"`, 8 digits ok, 5 and 9 refused, letters refused); link (round trip; code normalised to capitals without spaces or dashes; `pin` and `next` ignored; other scheme, other path, empty, a bad nickname, an overlong code are null; nickname with a space and an apostrophe survives encoding); presets (ask → nothing; small → two item rules at the cap; free → notify, no rules; caps per currency); setup (seven steps, numbers 1–7; copy inside the word budget: headings ≤ 6 words, labels ≤ 3 words; the data-minimum line verbatim; the share card never mentions a PIN value, only "The one you picked").
- [x] **Step 2: Run.** `pnpm --filter @jarso/core test -- tests/auth tests/family tests/rules tests/setup`. Expected: FAIL.
- [x] **Step 3: Implement**, the barrels and the export.
- [x] **Step 4: Run again plus Biome.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): parent setup steps, freedom presets, sign-in link`

### Task 2: Dependencies, camera plugin, confirmation template, OTP length

**Files:**
- Modify: `apps/mobile/package.json`, `pnpm-lock.yaml` (`expo-camera`, `qrcode`, dev `@types/qrcode`, via `expo install`)
- Modify: `apps/mobile/app.json` (`["expo-camera", { cameraPermission, microphonePermission: false, recordAudioAndroid: false }]`)
- Modify: `apps/mobile/tests/app-config.test.ts` (camera plugin present, no RECORD_AUDIO)
- Modify: `supabase/templates/confirmation.html` (adds the code), `supabase/config.toml` (`[remotes.production.auth.email] otp_length = 6`)

- [x] **Step 1: Install** with `pnpm --filter @jarso/mobile exec expo install expo-camera qrcode` and `pnpm --filter @jarso/mobile add -D @types/qrcode`.
- [x] **Step 2: Plugin and test.** `pnpm --filter @jarso/mobile test -- tests/app-config.test.ts`. Expected: PASS.
- [x] **Step 3: Template and config.**
- [ ] **Step 4: Commit.** `build(mobile): add expo-camera and qrcode` and `chore(supabase): email code in the confirmation template`

### Task 3: Sign-up on the phone (welcome, how it works, account, email code)

**Files:**
- Create: `apps/mobile/src/features/setup/{sign-up,setup-frame,welcome-screen,how-it-works,account-step,verify-step,sign-up-screen}.ts(x)`
- Create: `apps/mobile/app/(auth)/welcome.tsx`, `apps/mobile/app/(auth)/sign-up.tsx`
- Modify: `apps/mobile/src/features/setup/index.ts`
- Modify: `apps/mobile/src/features/auth/saved-sign-in.ts` (`loadSignInMode` → `SignInMode | null`), `apps/mobile/app/(auth)/sign-in.tsx` (fresh phone → Welcome; parent mode links to sign-up)
- Test: `apps/mobile/tests/features/setup/sign-up.test.tsx` (sign-up functions, Welcome, the sign-in redirect, how it works, account, code)

**Interfaces:**
```ts
export type SignUpOutcome = "signed-in" | "verify";
export async function signUpParent(input: { email: string; password: string; fullName: string }): Promise<SignUpOutcome>;
export async function verifyEmailCode(email: string, code: string): Promise<void>;
export async function resendEmailCode(email: string): Promise<void>;
export function WelcomeScreen(props: { next?: string }): JSX.Element;
export function SignUpScreen(props: { next?: string }): JSX.Element; // how → account → verify; redirects to /(parent)/setup once a parent session exists
```

- [x] **Step 1: Write the failing tests:** `signUp with a session goes straight on` (`signUp` returns a session → outcome `signed-in`); `signUp without a session asks for the code`; `a rejected sign-up shows one calm line and logs no email`; `offline sign-up says offline`; `a good code verifies with type email`; `a bad code says so calmly`; `resend waits 60 s` (fake timers); `welcome's I'm a kid saves the child choice and opens sign-in`; `how it works swipes three cards and Skip goes to the account form`; `the account form checks the fields like the web` (child-domain email refused, short password); `a fresh phone opens Welcome; a saved choice keeps the PIN screen`.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): parent sign-up with an email code`

### Task 4: About you (child-facing name + details), then family

**Files:**
- Create: `apps/mobile/src/features/setup/about-step.tsx`
- Modify: `apps/mobile/src/features/setup/profile-step.tsx` (`ParentDetailsForm` gets an optional `onSaved`), `apps/mobile/src/features/setup/use-setup.ts` (`useSaveChildFacingName`)
- Test: `apps/mobile/tests/features/setup/setup.test.tsx`

- [x] **Step 1: Write the failing tests:** `about you saves the details and then what the child calls you` (`updateProfileById` with `{ child_facing_name: "Mum" }`); `Other… takes a typed name`; `no pick saves nothing extra`; `a failed name write still moves on`.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): what your child calls you in setup`

### Task 5: Add a child, pocket money, freedom and share (steps 4–7)

**Files:**
- Create: `apps/mobile/src/features/setup/{child-step,pocket-money-step,freedom-step,use-freedom,share-step,qr-code}.tsx`
- Modify: `apps/mobile/src/features/setup/setup-screen.tsx` (the flow), `apps/mobile/src/features/setup/index.ts`
- Test: `apps/mobile/tests/features/setup/setup-flow.test.tsx`, `apps/mobile/tests/features/setup/setup.test.tsx` (the "/" path now goes on to Add a child)

- [x] **Step 1: Write the failing tests:** `a new family goes on to add a child`; `the child step shows the data promise and adds the child`; `Later skips to the family`; `pocket money renders the allowance editor and Not now moves on`; `ask writes nothing; small writes two rules; free writes notify`; `the share card shows code, nickname and a QR, never the PIN`; `Go to my family opens Family`; `a next skips steps 4–7` (existing tests).
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): add a child, pocket money, freedom, share`

### Task 6: Child sign-in: QR scan and PIN pad

**Files:**
- Create: `apps/mobile/src/features/auth/{pin-pad,scan-code}.tsx`
- Modify: `apps/mobile/src/features/auth/sign-in-form.tsx`, `apps/mobile/src/features/auth/index.ts`, `apps/mobile/app/(auth)/sign-in.tsx` (QR details from the link)
- Test: `apps/mobile/tests/features/auth/sign-in-form.test.tsx` (pad and scanner cases)

- [x] **Step 1: Write the failing tests:** `the PIN pad types up to 6 digits and deletes`; `the PIN shows as dots, never digits`; `a scanned Jarso code fills the code and nickname`; `a scanned other code says it isn't a Jarso code`; `a denied camera says to type it`; `a link's details fill the form`; existing sign-in cases on the pad.
- [x] **Step 2: Run.** Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): child signs in with a QR scan and PIN pad`

### Task 7: Maestro, docs and verification

- [x] **Step 1: Maestro.** `sign-in.yaml` (Welcome on a fresh phone; the PIN on the pad by testID), `parent-sign-in.yaml` (Welcome → I have an account), new `parent-sign-up.yaml` (needs confirmations off; creates an account per run).
- [x] **Step 2: Docs.** `docs/auth.md` (mobile sign-up, both confirmation shapes, the template with a code, the dashboard steps, the QR), `docs/mobile.md` (the parent flow, routes, the QR, the camera and the rebuild), `docs/testing.md` (Maestro list), `docs/roadmap.md` (sign-up email line).
- [x] **Step 3: Run** `pnpm check`. Fix this plan's failures; report others.
- [ ] **Step 4: Commit.** `docs: parent sign-up and onboarding on the phone`

## Open issues

- **Hosted steps for the user** (none can be done from here):
  1. `supabase config push` after reviewing `supabase config diff`, so the hosted email code is 6 digits (`otp_length = 6`; the phone also accepts 8 until then).
  2. Custom SMTP, then uncomment `[auth.email.template.confirmation]` and push the template (docs/auth.md hosted steps 2–3); only then turn confirmations on. Until then the phone's code screen never shows on hosted (confirmations off).
  3. A new development build (`npx expo run:android` or an EAS dev build): `expo-camera` is a native module. Until then the scanner button is hidden behind a "camera missing" check and the child types the code.
- `child_facing_name` can be set during setup only; editing it later from parent Settings is a follow-up (spec: "editable in parent settings").
- "Small ones" auto-confirmed put-ins stay silent for the parent (existing `create_deposit` behaviour); the parent sees them in history. If "just tell me" should also send a note for those, `create_deposit` needs a change: a later plan.
- No resume for steps 4–7 after the app is closed; Family's empty state covers adding the child.
- FR13's "No parent on Jarso yet?" (child-first invite) is not on the phone yet.

## Execution notes (deviations)

- The plan was first drafted with every box ticked ahead of the work; after a resumed session the boxes were re-checked against the code and tests and now reflect what was actually built and run. Only the commit steps stay open.
- `pnpm check -- --concurrency=2` forwards the flag into every package script and fails there; use `TURBO_CONCURRENCY=2 pnpm check`.
- Step 3's "About you" (`about-step.tsx`) wraps the existing `ParentDetailsForm`, which gained one optional prop, `beforeSave`, so the child-facing name is written just before the details. `profileCopy.completeBody` ("never shows to your child") was not reused there, because the name above it does show to the child; the details carry `profileCopy.detailsTitle`/`detailsBody` instead.
- No new data function: the name goes through the existing `updateProfileById` (`useSaveChildFacingName` in `features/setup/use-setup.ts`).
- The welcome, sign-in redirect and link tests live in `tests/features/setup/sign-up.test.tsx`; no separate `saved-sign-in` or `session` test change was needed (`loadSignInMode` now returns null for "never chosen"; a keystore read error counts as `child`, so it can never loop). The scanner tests are in `sign-in-form.test.tsx` with a fake camera module; no separate `scan-code.test.tsx`.
- `expo-camera` is loaded through `features/auth/camera.ts` (`requireOptionalNativeModule("ExpoCamera")` first): the package throws on import without its native side, so an old development build hides the scan button instead of crashing.
- Child scan and PIN pad words are a new `childScanCopy` in `packages/core/src/family/sign-in-copy.ts`; `childSignInCopy` (shared with the web) is unchanged. `setupFlowCopy` also gained `newHere` / `createAccount` for the parent sign-in screen's link to sign-up.
- The share card's done button reads "Go to family" (the mockup's "Go to my family" is 4 words, over the label budget).
- `parent-sign-up.yaml` stops at "About you": the date-of-birth dialog is not driven from Maestro. Maestro flows were written, not run (no device here).
- No migration was needed.

# Mobile app (Expo), wave 3: parents, native payments and push

Date: 2026-11-03. Owner: Pratyush. Follows `2026-11-02-mobile-app-design.md` (wave 1) and `2026-11-03-mobile-wave-2-design.md` (wave 2, child parity). Everything in those specs still holds unless this document says otherwise.

## Why

Waves 1 and 2 finished the child. A parent who opens the phone app today gets a "use Jarso on the web" screen (`apps/mobile/app/(auth)/parents.tsx`), and nothing on the phone can buzz anyone. Wave 3 makes the phone a full family app: a parent can run the family from it, including card handovers, and both parents and children get push notifications.

## Goals

1. **Parent parity on Android.** Every parent web screen has a phone twin (table below): family home, inbox, child hub, handover (cash and card), history, gifts, allowance and rules editors, the child's learning and guide views, the parent's own Jarso chat, adding a child, invitations and the family code, settings, and payments (save a card, auto charge, remove a card).
2. **Native card payments.** Card handovers and card saving use the providers' native sheets: Stripe PaymentSheet (`@stripe/stripe-react-native`) and Razorpay Checkout (`react-native-razorpay`). Same test-mode showcase as the web (ADR 0013, 0014): a provider is on only when its test keys are set, it posts the same ledger rows as cash, the child sees only "paid by card".
3. **Native push for parents and children.** Every notice that is pushed on the web today is also pushed to the recipient's phone. Tapping a push opens the matching phone screen.
4. **Quiet hours for children.** From 21:00 to 07:00 in the family's timezone, a child's pushes wait until 07:00. If two or more are waiting, they go as one summary push. Parents are pushed at any hour.
4a. **Per-phone notification settings.** Each person chooses which groups of notices buzz their own phone, or pauses all of them. The inbox is unaffected.
5. **A cleaner, calmer phone UI, across the whole app** (existing child screens and the new parent screens). The user: "not bloated big fonts, I want a clean, easy to read and understand". See Decided §9.
6. **Same rules, results and copy as the web.** Parent copy that lives in web components moves to `@jarso/core`, as wave 2 did for the child.
7. Web behaves and deploys exactly as before. `pnpm check` and the turbo pipeline stay green at every commit.

## Non-goals

- iOS. This wave is Android only: no `bundleIdentifier`, no APNs key, no Apple account. (From the user.)
- Real money. Payments stay test mode; real payments are out of the pilot (`REQUIREMENTS.md`).
- Parent sign-up and email confirmation on the phone. A new parent signs up on the web, then signs in on the phone. The phone's sign-in screen links to web sign-up. *(my call: email-confirmation deep links are a lot of work for a one-time step)*
- Hosted (browser) checkout on the phone. The user chose native sheets.
- A per-family setting for quiet hours. The window is fixed. *(my call)*
- Store release, EAS Submit, OTA channels, device e2e in CI (as wave 2).
- Web-push changes beyond the shared quiet-hours rule and the faster sweep.

## Anti-goals

- A payment marked paid because the phone said so. Provider webhooks stay the only source of truth for success; the phone only shows status it reads back from the server.
- A provider secret, a service-role key, or a Firebase service-account key in the app bundle or the repo. Only the provider *publishable* key or key id reaches the phone, and it comes from the API response, not from `EXPO_PUBLIC_*`. *(my call)*
- A child reaching any parent screen or parent-only route (role checked server-side and by RLS, not only by navigation).
- A child's phone buzzing between 21:00 and 07:00 family time.
- A push token that keeps buzzing a phone after its user signs out, or that delivers one family member's notices to another family member signed in later on the same phone.
- A web regression.

## Decided

From the user:
- Wave 3 = parents on the phone + push notifications + payments on the phone.
- Payments use native payment sheets, not an in-app browser.
- Android only for now.
- Push goes to both parents and children, for every notice.
- Children get quiet hours.
- The phone UI gets cleaner and less heavy: smaller, calmer type, easy to read and understand. It applies to the whole phone app, the child screens included.

My calls (each is open to the user's override):

### 1. Sign-in and routing

- The sign-in screen offers two paths: child (PIN, unchanged) and parent (email + password via `supabase.auth.signInWithPassword` directly from the phone; the session is stored as the child's is, `session-provider.tsx`).
- After sign-in, the app reads the user's role from their membership and routes to `(child)` or a new `(parent)` route group. Wrong-role route groups redirect.
- A signed-in user who has not completed a family (`parent/setup` on the web) gets the setup flow on the phone too (create family, complete profile).
- `(auth)/parents.tsx` (the placeholder) is removed.

### 2. Shared code

Following the wave 1 rule: direct to Supabase with RLS; `/api/v1` only where a secret, the admin client or a server-side check is needed.

- **Moves into `@jarso/data`** (plain user-client RPCs that live only in web repositories today; web repositories re-export them behind `server-only`, web services become wrappers, their tests stay green):
  - allowance and gifts writes: `create_allowance`, `change_allowance`, `pause_allowance`, `resume_allowance`, `stop_allowance`, `create_gift`, `update_gift`, `cancel_gift`, `confirm_handover`, `confirm_gift_handover`, `mark_not_given`, `decide_allowance_plan` (from `apps/web/src/features/allowance/server/repository.ts`)
  - rules: `set_money_rule`, `set_jar_moves_approval`, `set_allow_negative_spend`
  - family: `create_family`, `rename_child`, `update_family_timezone`
  - profiles: `complete_parent_profile`, profile update
  - the parent-side reads behind the family home, child hub, history and learning summary
- **Already shared, reused as is:** request decisions (`callDecideWithdrawal`, `callDecideDeposit`, `callComplete`, `callCancel`), diary, goals, notices.
- **Moves into `@jarso/core`:** parent copy and pure helpers now inside web parent components. `noticeTarget` (`packages/core/src/notifications/links.ts`) already returns parent targets (`handover`, `child`, `child-history`, `home`); the phone only adds a mapper from targets to its routes.

### 3. New bearer API routes

All under `apps/web/src/app/api/v1`, `withApi(..., { bearer: true })` (the request scope from wave 2), Zod-parsed, each calling the existing web service so the rules stay in one place. Each checks the parent role server-side.

| Route | Wraps |
|---|---|
| `POST /children` | `addChild` (admin `createUser`) |
| `PATCH /children/:id/pin`, `DELETE /children/:id` | `setChildPin`, `removeChild` (admin session revoke / delete) |
| `POST /invitations`, `GET /family/code` | `create_invitation`, family code (admin) |
| `PATCH /children/:id/guide-access`, `DELETE /guide/memories/:id`, `POST /guide/drafts/:id/confirm` | `setGuideAccess`, `forgetMemory`, `confirmActionDraft` |
| `POST /guide/turns`, `GET /guide/state` | open to the parent's own Jarso chat (today child only), same budget and screens as the web parent chat |
| `POST /notes` | `sendChildNote` (rate limit uses admin) |
| `POST /payments/in-app` | start a card handover for the native sheet (below) |
| `POST /payments/:id/cancel` | cancel a pending card handover |
| `PATCH /payments/auto-charge` | auto charge on/off for a schedule or gift (`setAutoCharge`); when no card is saved it returns native setup params carrying the same `arm` target, as the web opens a setup |
| `DELETE /payments/cards/:id` | remove a card |
| `GET /payments/:id`, `GET /payments/providers` | read status back after the sheet closes; which providers are on |
| `POST /push/tokens`, `DELETE /push/tokens` | register / unregister this phone's Expo push token |

`security-auditor` reviews the route set before merge.

### 4. Native payments

The web uses hosted flows: Stripe Checkout Sessions (`apps/web/src/lib/payments/stripe/index.ts`) and Razorpay Payment Links for payments, Razorpay orders plus Jarso's own checkout page for saving a card (`razorpay/index.ts`). Native sheets need different server objects, so the provider contract (`packages/core/src/lib/payments-types.ts`) gains two methods next to `createHostedPayment` / `createHostedSetup`:

- `createInAppPayment({ paymentId, amountMinor, currency, customerRef, description, expiresAt })` returns what the native sheet needs.
  - Stripe: a PaymentIntent on the customer (metadata carries `paymentId`), an ephemeral key, the customer id, the publishable key.
  - Razorpay: an order (`notes` carry `paymentId`), the key id.
- `createInAppSetup({ setupId, customerRef, contact? })`.
  - Stripe: a SetupIntent, ephemeral key, customer, publishable key.
  - Razorpay: the recurring-token order it already creates for saving a card, the key id. `setupNeedsContact` still applies: the phone asks for email and phone, sends them, Jarso never stores them.

There is no standalone "save a card" on the web: saving happens when a parent turns auto charge on without a saved card (`setAutoCharge` opens a setup with an `arm` target, and finishing it arms auto charge). The phone keeps that shape *(my call)*; `createInAppSetup` carries the `arm` target. The saved-card panel and auto-charge toggle (`features/payments/components/saved-card-panel`, `auto-charge-toggle`, used on the child hub and allowance screens) are the web sources of truth.

Webhook mapping (`map-event.ts`):
- **Stripe.** Today any PaymentIntent with `metadata.paymentId` maps to a final `failed` on `payment_intent.payment_failed` and on `requires_action`. That is right for off-session auto charge but would end an in-app payment mid-sheet on 3-D Secure (nearly every INR card) or on a first decline the sheet lets you retry. In-app PaymentIntents carry an extra marker (`metadata.jarsoInApp = "1"`); for them, `requires_action` and `payment_failed` are ignored (the parent can retry in the sheet), and only `payment_intent.succeeded`, a cancel or expiry end the payment. Auto-charge mapping is unchanged. Add `setup_intent.succeeded` for in-app card saving. *(my call: matches Razorpay pay-now, which already ignores failed attempts)*
- **Razorpay.** `order.paid` / `payment.failed` today act only on `jarsoSetup` / `jarsoCharge` notes. Add an in-app payment note (`jarsoPay`); `order.paid` succeeds it, `payment.failed` is ignored so the parent can retry.

Pending and expiry for in-app payments *(my calls)*:
- A PaymentIntent or Razorpay order has no provider-side expiry, unlike a Checkout Session or a Payment Link. Jarso keeps its own `expiresAt` (`CHECKOUT_MINUTES`).
- Closing the sheet early does not cancel. The live payment stores its native sheet params (client secret / order id), and `reuseLive` returns them, so reopening within the window reuses the same PaymentIntent or order instead of throwing CONFLICT. The parent can also cancel explicitly (`POST /payments/:id/cancel`).
- On expiry or cancel, the sweep also cancels the PaymentIntent at Stripe, so it can no longer succeed. Razorpay orders cannot be cancelled. A late `order.paid` after expiry follows the existing "unapplied" path (test mode only, so no real money is stranded).

The ledger write path is unchanged: the same service that settles a hosted payment settles an in-app one. The phone, after the sheet closes, polls `GET /payments/:id` until the status is final (or shows "still confirming" after a short wait). It never posts "success". Client-side Razorpay signature verification is not used; the webhook is the truth.

The `fake` provider (dev and e2e) gets in-app methods too: the phone, in non-production builds only, shows a plain confirm dialog that calls the existing fake completion path, so Maestro flows run without Stripe keys. *(my call)*

Minimum charge, provider choice when two are on ("Pay with Stripe" / "Pay with Razorpay") and the auto-charge job are unchanged.

### 5. Push

- **Device tokens.** New table `device_push_tokens(user_id, token, platform, created_at, last_seen_at)` in its own migration, RLS on, writes only via `register_device_push_token` / `unregister_device_push_token` (security definer), with the same rules as `push_subscriptions`: at most 10 per member, and a token moves to whichever account registers it on that device. A separate table rather than a `kind` column on `push_subscriptions`, so the web-push shape and its tests stay untouched.
- **Phone side.** `expo-notifications` + `expo-device`. After sign-in: create the Android channel, ask permission (Android 13+ `POST_NOTIFICATIONS`) with a one-line reason, get the Expo push token, `POST /push/tokens`. On sign-out: `DELETE /push/tokens` before the session is cleared. Tapping a push reads the notice's target from the payload and navigates; the notice is marked read the same way the inbox does.
- **Sender.** `dispatchPush` / `drainPush` (`apps/web/src/features/notifications/server/push.ts`) send each claimed notice to both transports: web push (unchanged) and the Expo Push API (`https://exp.host/--/api/v2/push/send`, batches of 100), reusing `noticeText` and the payload builder. Tickets with `DeviceNotRegistered` delete the token; receipts are checked on the next sweep. Expo sending does nothing when there are no tokens; it needs no Jarso-side secret (an Expo access token is optional and, if added, goes in `env.server.ts`). Today `dispatchPush` and `pushAfterNotices` return before claiming anything unless the VAPID keys are set (`isPushConfigured`). Each transport is now gated on its own config: claiming runs when either transport is on, and phone push works with VAPID unset. *(my call)*
- **Delivery state.** Still `pushed_at` only, at most once per notice (ADR 0012), now across both transports.
- **Quiet hours: hold until 07:00** (from the user, after plan review found the hourly allowance reminder creates child notices just after midnight). `claim_unpushed_notifications` does not claim a child's notice while the family-local time is in [21:00, 07:00); the 15-minute sweep claims it from 07:00. If a child has two or more notices held overnight, they get one summary push ("You have 3 new notices") that opens News; one held notice is pushed as itself. Notices stay unread in the inbox. Applies to web push too. Parents are never held.
- **Notification settings, per phone** (from the user: "they should control their own device"). Settings has a Notifications page for parents and children. It has a "Pause all" switch and four group switches:
  - Requests and answers
  - Allowance and money
  - Learning and Jarso
  - Notes from family

  A switched-off group still lands in the inbox and News; it just doesn't buzz that phone. Settings belong to the phone (the `device_push_tokens` row), so two phones on one account can differ. Signing out clears them, and a parent can't set a child's phone. Children's quiet hours stay on and can't be switched off; the 07:00 summary counts only the groups that phone has on. If Android notifications are off, the page says so and opens the phone's settings. Browser web push keeps its single on/off toggle *(my call)*. Plan 3, Tasks 14–15.
- **Faster sweep.** The daily Vercel cron (`apps/web/vercel.json`, 01:30) is too slow for reminders. Replace it with pg_cron + pg_net calling `/api/cron/push` every 15 minutes, as ADR 0012 suggested. Immediate dispatch after actions (`pushAfterNotices`, `/api/v1/notices/dispatch`) stays; the parent phone's actions trigger it as the child phone's do.
- **Credentials.** An FCM v1 service-account key uploaded to EAS (never in the repo); `google-services.json` supplied as an EAS file environment variable and git-ignored, so gitleaks has nothing to find. See `public-repo-security`.

### 6. Builds

- Native modules (Stripe, Razorpay, notifications) mean Expo Go no longer runs the app. Add a `development` profile to `eas.json` (`developmentClient: true`, APK) and `expo-dev-client`. `docs/mobile.md` switches to the dev build workflow.
- `app.json` gains the `expo-notifications` and `@stripe/stripe-react-native` config plugins and the Android `POST_NOTIFICATIONS` permission.

### 7. Navigation (parent)

Tabs: **Family** (home: needs you, open requests, summary, timeline), **Children** (list, then the child hub), **Jarso** (the parent's chat; hidden when the guide is off), **Inbox** (unread count). **Settings** from a header button. Child hub links to handover, history, gifts, allowance, rules, learning and guide. Request approve/reject and handovers are sheets. Mirrors the web parent nav where it can.

### 8. Device e2e

Maestro flows added: parent sign-in, approve a request, confirm a cash handover, card handover with the Stripe test card, save a card, change an allowance, add a child, receive a push and open it. Run locally against a dev build, as wave 2.

### 9. Phone type scale and visual calm

Today the phone uses the web's type scale from `packages/brand/tokens.ts` (`fontSize`, mapped in `apps/mobile/tailwind.config.js`): Display 40, H1 32, H2 24, H3 20, Money XL 44. That is too heavy at 360 dp. The phone gets its own scale; the web is unchanged.

| Token | Web (unchanged) | Phone | Weight |
|---|---|---|---|
| display | 40 / 44 | 26 / 32 | 800 |
| h1 (screen title) | 32 / 38 | 22 / 28 | 800 |
| h2 (section title) | 24 / 30 | 18 / 24 | 700 |
| h3 (card title) | 20 / 26 | 16 / 22 | 700 |
| body | 16 / 24 | 16 / 22 on child screens; 15 / 21 on parent screens | 400 |
| small (meta only) | 14 / 20 | 13 / 18 | 400–600 |
| caption (chips) | 12 / 16 | 12 / 16 | 600 |
| money-xl | 44 / 48 | 32 / 36 | 800 tabular |
| money-l | 28 / 32 | 22 / 26 | 700 tabular |
| money | 20 / 24 | 17 / 22 | 700 tabular |

- How: `packages/brand/tokens.ts` gains a `mobileFontSize` map with the same keys, and `apps/mobile/tailwind.config.js` reads it instead of `fontSize`. Screens keep using `text-h1`, `text-h3` and so on, so most screens change without edits. Raw Tailwind sizes in the phone app (`text-2xl`, `text-3xl`, `text-4xl`, `text-xl`, `text-lg`) are replaced by tokens. *(my call)*
- The child rule from `docs/design.md` stands: a child's reading text is never under 16. Parent body text is 15.
- System font scaling stays on (accessibility). Cap it at 1.3× (`maxFontSizeMultiplier`) on titles and money only, so layouts don't break. *(my call)*
- Calm, not just smaller:
  - hierarchy comes from weight and space rather than size
  - one accent (teal action or gold money) per card
  - meta text in the muted colour
  - spacing on the 4 dp grid with 16 dp gutters and 12–16 dp card padding
  - no more than one Display or Money XL per screen
  - lists over stacked cards where items repeat
- `docs/design.md` §3 gains a "Phone" column so the rule lives in one place.
- **Approved mockups** (from the user): `docs/superpowers/specs/mockups/2026-11-03-mobile-wave-3-type-scale.html`, phones **B** (child Home) and **C** (parent Family home). Phone A is the current Home, for comparison only. B and C are the target for type, density and layout:
  - **B (child Home):** a date line over a 26 greeting. Both jars sit in one card with the total and two quick actions. "Do this next" has an eyebrow label, a 16 bold title and one primary pill. The goal card shows a thin gold progress bar and a single line saying how many allowances are left.
  - **C (parent Family home):** a "Needs you" card with inline Approve / Say no and Hand over, then a Children list with rows, not cards. Each row shows the total in Money 17 and the Spend · Save split in small type.
- Done when: every existing child screen and every new parent screen uses only tokens (no raw `text-Nxl` in `apps/mobile`, enforced by a grep in tests), and before/after screenshots of Home, Diary, Learn and the parent family home are attached to the PR.

## Screens and their web sources of truth

| Mobile | Web |
|---|---|
| Family home | `app/(app)/parent/page.tsx` |
| Inbox | `parent/inbox/page.tsx` |
| Child hub (due allowance, gifts, allowance card, guide card, learning summary) | `parent/children/[childId]/page.tsx` |
| Handover (cash, card, not given) | `parent/children/[childId]/handover/[kind]/[id]/page.tsx` |
| History and where it went | `parent/children/[childId]/history/page.tsx` |
| Gift new / edit / cancel | `parent/children/[childId]/gifts/**` |
| Allowance list / edit / pause / stop | `parent/allowance/page.tsx`, `children/[childId]/allowance/**` |
| Rules | `children/[childId]/rules/page.tsx` |
| Learning (read only) | `children/[childId]/learning/page.tsx` |
| Child's Jarso chats and memories | `children/[childId]/guide/**` |
| Parent's Jarso chat | `parent/jarso/page.tsx` |
| Add a child | `parent/children/new/page.tsx` |
| Setup (family, profile) | `parent/setup/page.tsx` |
| Settings (names, details, family code, timezone, per-child: rename, PIN, remove, guide access) | `parent/settings/page.tsx` |
| Saved card and auto charge (on the child hub and allowance screens) | `features/payments/components/saved-card-panel`, `auto-charge-toggle` |
| Accept an invitation (by family code; a `jarso://invite?...` link also works, no Android App Links this wave, my call) | `invite/page.tsx` |

The builder reads each web component before its twin. Behaviour, validation and copy match; layout is phone-native (sheets, tabs, pull to refresh, 48 dp targets, labels and roles).

## Left to the builder

- Order of work inside the wave, and how it is split into PRs (suggested: sign-in + routing + shared data first; push next; payments last).
- Exact library versions; query keys; file grouping inside new `@jarso/data` modules.
- The permission prompt's wording within `docs/design.md` voice.
- Whether the Expo receipt check runs inside the push sweep or its own job.

## Done when

- On an Android phone (dev build) against local `pnpm dev` and the hosted project, a test parent can do every row of the screens table, and the child sees the results on their phone and the web.
- With Stripe and Razorpay test keys set, a parent hands over an allowance by card through each native sheet (a 3-D Secure test card included), saves a card through each by turning auto charge on; the ledger rows match a cash handover; the child sees "paid by card". Closing the sheet early leaves the payment pending, then expired, never paid.
- A child's request pushes the parent's phone within seconds; the parent's decision pushes the child's phone; tapping each opens the right screen.
- A notice for a child created at 22:00 family time does not push until 07:00 (one summary push if several were held) and is unread in News; one for a parent at 22:00 pushes at once.
- Signing out stops pushes to that phone; a different family member signing in on it gets only their own.
- A child token cannot call any parent route (test). No secret in the bundle (`security-auditor`, gitleaks).
- Maestro flows pass locally. `pnpm check` and CI are green. Web is unchanged for users; its unit and e2e tests pass.

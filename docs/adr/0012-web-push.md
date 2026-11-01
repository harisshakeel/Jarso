# 0012. Web push from the notice row itself, with no delivery table

- Status: Accepted
- Date: 2026-10-31
- Amends: [0006](./0006-notifications-as-derived-records.md) (channels and the dispatcher)

## Context

ADR 0006 planned `notification_deliveries` rows per channel, a webhook-triggered dispatcher with retries and a dead state, and email before push. The inbox has shipped without any of that (roadmap slice 2), and email for notices stays deferred: there is no sending domain yet. FR16 still asks for web push after the user grants permission, and for the app to be installable. The deployment is a Vercel Hobby project (daily cron at most) and a hosted Supabase project; the audience is ~60 users in a handful of families.

## Decision

- **Push is an at-most-once copy of the inbox row.** `notifications.pushed_at` is the only delivery state. `claim_unpushed_notifications` marks a batch of the last day's unpushed notices with `for update skip locked` and returns them with the recipient's role, the family currency and the child's nickname, so the push text is `noticeText` of the same row the inbox shows. A notice older than a day is left for the inbox; a failed send is logged by status only and not retried. No `notification_deliveries`.
- **Dispatch runs where notices are made, then as a sweep.** Server Actions and the outbox route that can write a notice (requests, decisions, purchases) call `pushAfterNotices()`, which schedules `dispatchPush()` with Next's `after()` so the form never waits on a push service. A Vercel cron (`/api/cron/push`, daily, `Authorization: Bearer $CRON_SECRET`) picks up what no action pushed, chiefly the hourly allowance reminders. The route does not exist without the secret.
- **Subscriptions belong to the signed-in member and to one browser endpoint.** `push_subscriptions` (owner-only select; writes only through `push_subscribe` / `push_unsubscribe`). Subscribing an endpoint another account used on the same device moves it to the caller, so a parent's notice never shows on the child's screen. A 404/410 from the push service deletes the row.
- **Everything works with push off.** Without `VAPID_PRIVATE_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` the toggle does not render, `pushAfterNotices()` is a no-op and the cron claims nothing (notices stay unclaimed, so turning push on later does not replay a day of old pings: the first sweep claims and sends only what is under a day old).
- **Install** is the standard web app manifest (`/manifest.webmanifest`, brand icons at 192 and 512) plus `apple-mobile-web-app` metadata. `public/sw.js` shows a push and opens the notice's record; it caches nothing, because the app's offline story is its own outbox (`features/offline`), not a cached shell.
- **Email for notices stays deferred** until a sending domain exists; the Resend adapter remains for invitations.

## Consequences

- One column and three small functions instead of a delivery table and a worker; nothing to retry, nothing to go dead.
- A notice may be pushed twice only if two dispatchers claim concurrently, which `skip locked` prevents; it may be pushed never if the device was offline past the push service's TTL (one hour), and the inbox still has it.
- The daily cron means an allowance reminder written at 05 past the hour reaches a phone by the next sweep unless some action pushed it sooner. A Pro plan can shorten the schedule in `vercel.json`; `pg_cron` + `pg_net` calling the route hourly is the alternative that needs no plan change.
- The VAPID private key is a new secret with no recognisable prefix; the three scanners match it by name in the forms the generator prints (`VAPID_PRIVATE_KEY=…`, `"privateKey": "…"`, a bare key after `Private Key:`).
- A member keeps at most 10 subscriptions and the dispatcher sends a few at a time, so one account cannot turn a notice into thousands of requests. The claim skips a recipient who is no longer an approved member, matching what the inbox's RLS shows.
- On a browser profile two accounts share, the switch shows "on" only when the signed-in account owns the browser's subscription (`pushOwnedAction`); otherwise it shows "off" and turning it on takes the endpoint over. Signing out does not unsubscribe the browser, so the previous account keeps its pings on that device until the next account turns them on.
- Each send has a 10 s timeout and the daily sweep drains batch after batch within its time budget, so a stalled push service or a busy day cannot leave claimed notices unsent.

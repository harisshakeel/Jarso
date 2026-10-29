---
session_id: f2cf84e8-1357-40c2-8859-1885b8ff7734
agent_id: aa3c548c169f1e89c
agent_type: general-purpose
model: default
description: Builder check on milestone spec
finished: True
total_exchanges: 1
generated_at: 2026-10-29T08:37:02.431834
---

# Subagent: Builder check on milestone spec

Session: `f2cf84e8-1357-40c2-8859-1885b8ff7734` | Agent: `aa3c548c169f1e89c` | Type: `general-purpose`


[CLAUDE_LOG_ENTRY type=PROMPT num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=aa3c548c169f1e89c]
timestamp: 2026-10-28T16:32:09.018Z
time: 2026-10-28 16:32
chars: 1001

You are a talented full-stack software engineer (Next.js 16 + Supabase/Postgres). You've been handed a design document and asked to put together a plan to build what it describes. You will not be able to talk to the person who wrote it.

Read /home/ezio/Desktop/Work/8x/Jarso/docs/superpowers/specs/2026-10-28-first-milestone-design.md. It references other docs in the same repo (REQUIREMENTS.md, docs/domain.md, docs/architecture.md, docs/adr/, docs/design.md, CLAUDE.md); read those as needed. Do not read any .env* files.

Report only the questions you'd still need answered before you could plan this well: places where you'd have to guess and a wrong guess would matter. For each, give the question and why the answer changes the plan. Rank them by importance.

Skip anything the document explicitly leaves to the builder, and anything you could reasonably decide yourself. Skip nitpicks about wording.

If nothing important is left, say "nothing important left". Keep the report under 500 words.


[CLAUDE_LOG_ENTRY type=RESPONSE num=1 session=f2cf84e8-1357-40c2-8859-1885b8ff7734 agent=aa3c548c169f1e89c]
timestamp: 2026-10-28T16:32:59.741Z
time: 2026-10-28 16:32
chars: 3725

I'd need six questions answered before planning this. They're ranked by importance below.

1. **Are savings deposits in this milestone or not?**
   - The spec lists deposits as a non-goal (§2).
   - But §2 also promises a test for every first-milestone acceptance criterion. REQUIREMENTS.md lists one of those criteria as "A savings deposit posts only after the parent confirms receiving the cash. Cancellation and rejection change nothing."
   - **Why it matters:** if deposits are in, slice 4 grows. It would need the deposit type, a cancel transition, a Spend-cap check at both request and confirmation, child and parent screens, and notices. If they're out, slice 0 has to edit that acceptance criterion and the slice 6 checklist changes.

2. **How do judges see an allowance fall due and get a reminder during a live demo?**
   - Generation runs hourly and reminders fire every 3 days (D4), all in family-timezone dates.
   - A live demo needs either a pre-aged seed, a "run now" trigger, or a clock override (functions taking a `now` parameter).
   - The demo runs on the one hosted project, which previews also share. The spec also lists admin tooling as a non-goal.
   - **Why it matters:** it decides whether every time-based function takes an injectable clock. It also decides whether a guarded trigger route ships to production, and what slice 6's seed must look like.

3. **What exists for a child-initiated onboarding before the parent approves?**
   - Architecture §7.1 creates the child's auth user only in `accept_invitation`, so before approval there's no account or session at all. The spec instead implies a persistent "waiting for your parent" screen and a testable "unapproved child cannot use app".
   - Do we need a pre-approval child identity (for example an invited `family_members` row), or is the waiting screen a stateless confirmation?
   - If the invited parent already has a family, does the child join that family or start a new one?
   - **Why it matters:** this shapes the slice 1 schema (nullable `family_id` on invitations, member statuses), the RLS tests, and the email-spam surface. The child form is unauthenticated and sends email to any address, so it needs rate limiting.

4. **Is there a sending domain and Resend account for the hosted demo?**
   - Resend can't send to arbitrary recipients without a verified domain, and `jarso.vercel.app` can't be verified.
   - Supabase's built-in SMTP is heavily rate-limited for parent sign-up confirmation (D7).
   - Child-initiated onboarding depends on email in slice 1, not slice 5, so the "ship without email" fallback in §10 doesn't cover it.
   - **Why it matters:** without email, the slice 1 critical path needs a non-email fallback for the invitation link (a short code, or a copyable link).

5. **Can a parent have more than one child in this milestone?**
   - REQUIREMENTS.md still lists this as an open decision, and the spec doesn't resolve it. The schema supports many children (ADR 0005), but the parent routes in architecture §4.2 have no child selector.
   - **Why it matters:** it decides whether every parent screen, action and badge is scoped by a child id (child switcher, route params) or assumes a single child. Retrofitting that later touches every parent screen.

6. **Which currency, and how many decimal places?**
   - `families.currency` exists, but pilot countries are still open. Hosting in Tokyo hints at JPY, which has no decimal places.
   - **Why it matters:** `formatMinor`, amount input parsing, the Zod schemas, the seed values and the test fixtures all depend on how many minor units make one main unit. The plan also needs to know whether the parent picks the currency at family creation or it's fixed.

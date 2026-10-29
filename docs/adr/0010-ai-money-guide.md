# 0010. AI money guide: a screened Claude pipeline behind two switches

- Status: Accepted
- Date: 2026-10-30

## Context

FR07 asks for an AI money guide that answers questions, explains answers and gives progressive hints; FR09 sets its boundaries. The users are 11 to 14. Anthropic allows API products for minors only with age-appropriate controls, moderation, monitoring and clear AI disclosure; COPPA (US under-13s) needs parental consent before a child's data goes to a third party and a published retention policy; the UK Children's Code says a child must be told about monitoring. Design and research: `docs/superpowers/specs/2026-10-29-learning-and-guide-design.md` §3 and §5. The product owner moved the guide into the pilot behind a flag (spec decision 1).

## Decision

- **Two switches.** `FEATURE_GUIDE` turns the guide on for a deployment (with `ANTHROPIC_API_KEY`, or the `fake` provider outside Vercel production for e2e). A per-child parent switch (`guide_access`), off by default, turns it on for one child; turning it on is the parent's recorded consent to sending that child's messages to Anthropic.
- **A screened pipeline** (`features/guide/server/pipeline.ts`) for every message: scrub contact details; run a Claude Haiku 5.5 input screen and the Claude Opus 5.5 main call (effort low, structured output) in parallel; run a Haiku output screen on the reply. Anything but an on-topic reply that passes the output screen becomes reviewed fixed copy (`copy.ts`). Safety messages get support, "talk to an adult you trust", the family's helplines and an emergency line, and are flagged. Replies are not streamed, so nothing unscreened reaches a child.
- **No refusal fallback.** A declined request is never retried on another model; the child gets the fallback copy.
- **Context by key only.** The browser sends content keys (mission, step, topic); the server builds the context from reviewed content, so nothing a browser sends becomes instructions. The frozen system prompt carries the reviewed topic material and is cached; per-request context is a mid-conversation system message after the child's message.
- **Transcripts only the server writes.** `guide_conversations` and `guide_messages` are readable by the child and their parents (RLS) and writable only through `service_role` functions the service calls after its own checks, so a child can't forge what the guide said and a parent can trust what they read. This is the one place the admin client writes on a child's behalf (rule 8): it runs only after `assertRole("child")`, the guide switch and the rate limits.
- **Parents read every chat, flagged first**, and the child is told before their first message. A child message that got a safety response is the exception: the parent sees that a safety response was shown, not the message (spec decision 3), so a child can reach out without the message going to the person it may be about.
- **Limits:** 5 messages a minute and 30 a day per child (`hit_rate_limit`), 12 turns per chat, a global daily budget in cents (`GUIDE_DAILY_BUDGET_CENTS`) from stored token counts, and a per-instance circuit breaker after 5 Claude failures in a minute.
- **Retention:** a daily pg_cron job blanks message text after 30 days and keeps route, flag and token counts. Logs carry route, model, tokens and latency, never message text.
- **Launch gate:** about 150 eval cases (`evals/guide`) run on request through the real pipeline and a Claude judge. The guide is switched on for real families only after 100% of safety and personal-information cases route correctly, zero FR09 breaks, and at least 95% of on-topic questions are judged helpful, plus a legal review for the UK and US.

## Consequences

- Each message costs about a cent (three calls); the daily budget and a billing alert bound it.
- Replies take a few seconds behind a "Thinking…" line; revisit streaming if p95 passes 6 seconds.
- Changing a prompt or model means bumping `GUIDE_PROMPT_VERSION` and re-running the evals.
- Helplines are chosen by the family's currency (GBP: UK, USD: US, else findahelpline.com) so a child's request never reads a parent's private details.
- The per-instance breaker resets on each new serverless instance; acceptable at pilot scale.

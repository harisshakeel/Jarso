# Jarso, the agent

Date: 2026-10-30. Status: slice 7 built (roadmap, Demo 2). Decision record: ADR 0011. Builds on the guide (ADR 0010, `2026-10-29-learning-and-guide-design.md` §5).

## 1. Goal

Jarso's AI is the app's headline feature: a prompt window at the top of the child's Home that answers from the child's real money and learning, such as "how much do I have?", "what did I spend this week?" or "my bike costs £120, how long will it take?". Product owner decisions (2026-10-30): child first, parent later; the savings goal straight after; structured memory; Claude Sonnet 5.5 for the answers; the name Jarso; a separate `instructions.md` for its voice.

**Never:** a figure the app didn't produce; another child's money or a parent's planned gift; a judgement about how much a child has; Jarso moving money.

## 2. One turn

1. `POST /api/v1/guide/turns` → `prepareGuideTurn`: child role, the flag, the parent's switch (on by default; off only when a parent turned it off), a re-sent question (stored reply), the context key, the chat, the rate limits. Any failure is a JSON error before streaming starts.
2. `streamGuideTurn` → `runGuideTurn`: budget and breaker, then `runGuidePipeline` with a toolbox for the signed-in child (`createTurnTools`, the child's id from the session).
3. The pipeline scrubs the message and starts the Haiku input screen and Jarso's answer together. Look-ups wait for the screen: a message routed elsewhere reads nothing.
4. Jarso's loop (Sonnet 5.5, low effort, tools strict, at most 3 rounds and 6 look-ups). Each look-up streams a fixed status line ("Looking at your jars…"). The final answer is structured JSON: reply, topics, optional check.
5. Refs (`{{jars.save}}`) are filled from the look-ups. An unknown or broken ref holds the reply back.
6. The Haiku output screen reads the filled reply and the looked-up figures.
7. The turn is stored with its look-ups (names and arguments); the reply streams as one line.

## 3. Tools

| Tool | Reads (service) | Returns (figures as refs) |
| --- | --- | --- |
| `get_jars` | `getJars`, `listDueForChild` | `jars.spend`, `jars.save`, `jars.total`, `jars.waiting` |
| `get_allowance` | `getSchedule`, `listDueForChild` | `allowance.amount`, `allowance.next_date`, `allowance.waiting`; how often; status |
| `get_money_history(period)` | `getHistoryPage` | `history.money_in`, `history.spent`, `history.purchases`, up to 10 lines (`history.N.date`, `history.N.amount`); labels scrubbed, braces removed; `complete` |
| `get_money_rules` | `getChildRules` | spending limits (`rules.spend_limit_<period>`), overspend setting |
| `get_learning` | `getLearningOverview` | next step, skill levels, `learning.practice_due`, `learning.days_this_week`, `learning.missions_done` |
| `plan_saving(price, save_each)` | `getJars`, `getSchedule` | `plan.price`, `plan.in_save`, `plan.still_needed`, `plan.save_each`, `plan.allowances`, `plan.allowance_amount`, `plan.next_date` |

Specs live in `server/tool-specs.ts` (pure data, shared by the provider, the fake provider and the evals); runners in `server/tools.ts`. Adding one: spec, runner over a feature service, `guideCopy.status` and `guideCopy.checked` copy, a unit test, and eval cases.

## 4. Prompt and voice

`prompts.ts` holds the rules: what Jarso helps with, how Jarso works, when to look things up, how to write figures (refs only; no arithmetic about the child's money), and the FR09 rules as amended (state own figures plainly, never judge or compare). `instructions.md` holds the voice: short sentences, everyday words, one idea, at most 80 words, figure first when asked about money, praise thinking never amounts, examples. Both are byte-identical across requests; changing either bumps `GUIDE_PROMPT_VERSION` and needs an eval run.

## 5. UI

- **Child Home:** "Ask Jarso" is the first card under the greeting when Jarso is on. Disclosure line, suggested questions, the box with "Ask", status lines while it works, inline replies with "Looked at: …", "New chat". The intro card comes first for a child who has never chatted. Design: `docs/design.md` §6.
- **Sheet:** "Help me", "Why?" and topic pages keep the bottom sheet, now titled Jarso, through the same pipeline and tools.
- **Parent:** the switch's consent text covers the data; transcripts show "Looked at: …" per reply. `/safety` explains what Jarso can and can't see.

## 6. Safety and privacy

On by default (product owner, 2026-10-31): a parent is told on the add-child form and can turn Jarso off at any time; `guide_access.consent_version` records which explanation they had when they turned it on; look-ups only after the input screen; only the child's own data, through their RLS; planned gifts unreachable; no writes; figures from the app; look-ups stored as names and arguments only; logs carry look-up names, never results or text; 30-day text retention unchanged.

## 7. Evals

`evals/guide` runs every case through the real pipeline with a fixture child (`fixture-tools.ts`: Spend £12.40, Save £64, £10 a week, a planted instruction in one purchase label). 22 new cases: 15 data cases (one compares two weeks) graded on the look-ups made and the figures shown, 4 scope cases (a sibling's money, a present, a parent's money, moving money), 3 judgement cases. Gate adds: every data case right.

## 8. Next (roadmap slice 8)

- **Goal look-up.** After the savings goal ships (slice 3): `get_goal` returns the goal name (scrubbed), price, saved (net of reserved), still needed, plan per allowance and payments left, all as refs; `plan_saving` stays for "what if" prices.
- **Memory.** `guide_memories`: child, kind (`interest`, `thinking_about`, `finds_tricky`, `prefers`), text ≤ 140 characters, created, expires (90 days); at most 20 per child. Written only by a `remember` tool on an on-topic turn, after the scrub and a Haiku personal-details check; never balances or goals (always looked up fresh). Read into the per-request context as data. Child and parent see "What Jarso remembers" and can delete any fact. Consent copy and `/safety` updated in the same PR.
- **Parent Jarso** later: the same engine with a family skill, parent-only storage.

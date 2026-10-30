# 0011. Jarso, the agent: read-only look-ups of the child's own data, figures the app fills in

- Status: Accepted
- Date: 2026-10-30
- Amends: [0010](./0010-ai-money-guide.md) (model, consent, what the guide may say about money)

## Context

The guide of ADR 0010 answers money questions from reviewed topic material only; it can't see a child's jars, allowance or learning, and the learning spec listed "the guide reading balances, jars or goals" as a non-goal until those features existed. They exist now. The product owner wants Jarso's AI to be the app's headline feature: a prompt window at the top of the child's Home that answers questions like "how much do I have?" or "how much more do I need for my bike?" from the child's real data. Getting this wrong is worse than not having it: a made-up balance, another child's money, a parent's planned gift, or a judgement about how much a child has would each break trust with families. Design: `docs/superpowers/specs/2026-10-30-jarso-agent-design.md`.

## Decision

- **Read-only tools, not SQL.** Jarso gets six typed tools (`server/tool-specs.ts`): `get_jars`, `get_allowance`, `get_money_history`, `get_money_rules`, `get_learning`, `plan_saving`. Each runner (`server/tools.ts`) reads through the existing feature services with the signed-in child's own Supabase client, so RLS applies and the layering holds. The child's id comes from the session, never from the model. No tool writes. Arguments are strict-schema'd for Claude and validated again with Zod. At most 3 rounds and 6 look-ups per turn. The model never writes SQL and never runs code.
- **Look only after the screen.** Every look-up waits for the input screen's verdict; a message routed anywhere but on-topic triggers no look-up. (Earlier on-topic turns in the same chat, which may hold filled-in figures, are still history.) Labels people typed (purchases, gift notes) skip the input screen, so one that trips the safety keyword net or reads like an instruction is not shown to the model.
- **Figures the app fills in.** Every figure a tool returns comes as `{ ref: "{{jars.save}}", value: "£30" }`. The model writes refs, never the figures; the pipeline fills them from what the tools returned. A ref that was never looked up, or anything that looks like a broken ref, holds the reply back. Arithmetic and comparisons about the child's money (whether Spend covers a price, what is still needed, how many allowances) happen in code (`plan_saving`), never in the model. The output screen gets the looked-up figures and fails a reply that states a figure about the child's own money that isn't among them (`invented_figure`).
- **What Jarso may say about money (FR09 amended).** It states the child's own figures plainly when asked. It still never judges an amount (small, big, a lot, not much), never compares it with anyone's, never tells the child to buy anything, and says it can't see other children's money, a parent's planned gifts, or anything outside Jarso. Parent-only data (planned gifts) is unreachable: the child's RLS already hides it.
- **Consent version 2.** Turning Jarso on now also consents to sending the child's own money and learning data that Jarso looks up to Anthropic. `guide_access.consent_version` records which consent was given; Jarso runs only under version 2, so every child switched on under ADR 0010 is off until a parent turns it on again with the new explanation. `guide_start_conversation` checks the version too.
- **Parents see what Jarso looked at.** Each reply stores its look-ups (`guide_messages.tool_calls`: names and arguments, never results), shown as "Looked at: jars, allowance" to the child under the reply and to the parent in the transcript. After 30 days the retention job keeps only the names, since an argument can echo the child's words.
- **Claude Sonnet 5.5 for the answer** (product owner's choice, for cost), adaptive thinking at low effort, structured output for the final answer, tool choice `auto`. Haiku 5.5 screens stay. Within a turn the loop only appends (each response, thinking blocks included, goes back unchanged); across turns history stays plain on-topic text. Tools and the system prompt are byte-identical on every request, so they are one cached prefix; the per-request context stays a mid-conversation system message.
- **Status lines, not streamed text.** `POST /api/v1/guide/turns` returns NDJSON: a fixed status line per look-up ("Looking at your jars…"), then the screened reply in one piece. Checks (auth, switch, limits) fail as a JSON error before anything streams. ADR 0010's rule holds: nothing unscreened reaches a child.
- **Jarso's voice in its own file.** `server/instructions.md` holds tone and style only and is included in the system prompt; the rules in `prompts.ts` always win. It is versioned with the prompt.
- **Name.** The helper is called Jarso, the app's name, and still says it is an AI, not a person or a friend.

Kept from ADR 0010: the two switches, the screens, scrubbing, no refusal fallback to another model, rate limits, budgets, the breaker, 30-day text retention, logs without message text (look-up names only), and the eval gate.

## Consequences

- A question that needs a look-up costs about 1.5 cents and takes one extra model round (a few seconds) behind its status line; one that doesn't costs well under a cent. The US$100 monthly cap covers several thousand questions.
- The eval gate gains a fourth condition: every data case looks up what it needs and shows the fixture child's real figures (`evals/guide/fixture-tools.ts`). The model change and the new prompt need a fresh eval run before real families.
- Adding a tool means a spec, a runner over a feature service, status and parent copy, tests, and eval cases; refs keep working unchanged.
- Children switched on before this change lose Jarso until a parent re-consents. That is intended.
- Next: the savings goal (FR02) and a `get_goal` tool, then structured, parent-visible memory.

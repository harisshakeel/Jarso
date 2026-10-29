# 0009. Learning content as code, progress in Postgres

- Status: Accepted
- Date: 2026-10-30

## Context

FR06, FR08 and FR10 need a seven-day journey of short missions, five topic pages, a starting check-in and spaced practice that returns with new examples. About 150 authored items (prompts, options, hints, feedback, misconceptions) must stay reviewable by the product owner, change rarely, and ship with the app. Children's progress must survive between visits, be visible to their parents, and never mix with money (invariants 2 and 11). Design: `docs/superpowers/specs/2026-10-29-learning-and-guide-design.md` §4.

## Decision

- **Content is versioned JSON in the repo** (`src/content/learning`): missions, topics, a review pool and the check-in. `features/learning/content.ts` parses it with Zod when the module loads, so a bad edit fails `next build`, the unit tests and CI. Keys are stable kebab-case strings; a mission carries a `version`, and attempts record the version they ran. Amounts are fictional minor units written as `{m:1250}` and shown in the family currency. No admin UI.
- **Content never reaches a shared client bundle.** Pages read it on the server and pass the one mission, topic or practice set the child needs to the player as props. Answers ship with the active step: acceptable for a learning app and needed for instant feedback.
- **One pure `gradeStep`** grades on the device for instant feedback and again on the server before recording. The client's word is never taken for right or wrong.
- **Progress lives in Postgres**: `mission_attempts`, `step_results`, `skill_progress`, `review_items`, `practice_results`, `learning_checkins`. The child and the child's approved parents read through RLS; writes go only through `security definer` functions that check the caller is an approved child. Results are idempotent per step and phase, and per practice item per day.
- **Missions never touch the ledger.** Their amounts are question content, not practice money.

## Consequences

- Content changes go through PRs and CI like code; the product owner reviews copy there.
- A determined child calling the functions directly could forge their own learning stats. It changes nothing else, so it is accepted (spec §12).
- Changing a mission's steps needs a version bump; an open attempt on the old version is abandoned and the child starts again.
- Adding a language later means a content folder per locale and a locale key on attempts.

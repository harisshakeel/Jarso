# Mobile Kid Rework, Plan 2: Progress backend (Sparks, levels, badges, streak, check-in, Jarso look, child-facing name)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server side of the fun loop. Sparks are awarded inside the database whenever a child logs money, saves, does a lesson step or reaches a goal milestone, plus a daily check-in. On top of that come levels, badges and a forgiving streak, the child's chosen Jarso look, and the name the child calls each parent. The app gets a single read model through `get_progress`.

**Architecture:**
- Pure rules live in `@jarso/core/progress`: values, caps, level thresholds and names, badges, schemas and copy.
- Postgres owns the state. There are four tables and `security definer` functions, and every award happens in `AFTER` triggers on the existing ledger, learning and goal tables. Clients can't farm Sparks because they have no write grants.
- `@jarso/data/progress` wraps the RPCs.
- The mobile hooks read `get_progress` and call `daily_checkin` / `set_jarso_look`.
- Stacked on PR #141, which provides `@jarso/core/mascot`.

**Tech Stack:** Postgres 15 (Supabase, hosted), pgTAP, TypeScript, Zod, Vitest, TanStack Query, Jest.

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md` ("Fun loop", "Data and backend implications"). The database design comes from the supabase-architect review and is reproduced in the Design Reference below; it is binding.

## Global Constraints

- **Never commit until the user says so.** The Commit steps record the intended split.
- **Never push migrations to the hosted project without asking.** Use `pnpm exec supabase db push --linked --dry-run` only. Never run `db reset`. No Docker. pgTAP and e2e run in the PR's CI (`migrations` job). Implementers cannot run SQL locally, so the SQL must be written carefully and cross-checked against the existing migrations it hooks into.
- **Sparks are never money.** They never touch `ledger_entries` and there is no conversion path. Undo or reversal never claws Sparks back.
- **Fixed values** (core and SQL must match exactly):
  - Sparks: log (purchase or money got) **10**, check-in **5**, mission step **15**, save (deposit posted) **20**, goal milestone (25/50/75/100%) **25** each, goal reached **100**.
  - Caps per family-local day:
    - logs **3**
    - check-in **1**
    - steps **20**, and each step only once for life
    - saves **2**
    - each goal milestone once per goal
    - goal reached at most once per rolling **7** days
- **Levels** (index = level; Sparks needed): `[0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200]`, so the levels run 1–10.
  - Names: 1 Jar Starter, 2 Coin Spotter, 3 Smart Saver, 4 Coin Keeper, 5 Money Maker, 6 Budget Boss, 7 Goal Getter, 8 Money Mind, 9 Jar Hero, 10 Jar Legend.
  - Wear unlocks: none and cap Lv1, shades Lv3, headphones Lv4, crown Lv5. These come from `@jarso/core/mascot` `WEAR_UNLOCK_LEVEL`.
- **Badge keys (exactly 23):** `first_log, logs_10, logs_50, logs_100, diary_week, first_checkin, checkins_7, checkins_30, streak_3, streak_7, streak_14, streak_30, first_save, saves_5, saves_20, first_mission, missions_5, missions_10, goal_set, goal_half, goal_reached, level_3, level_5`.
- **Streak.** Days are family-local, and weeks are ISO weeks starting Monday. A day counts as active if it has a check-in, a log or a step. Today not being done yet is not a miss. One automatic rest day per ISO week covers a single missed day, but only when the day before it was active. Two misses in a row break the run. A broken run is never mentioned anywhere: there is no "lost" field and no copy for it.
- **Award day** is the family-local `now()`, never the device's `occurred_at`.
- **Practice mode is excluded.** Only `mode = 'recorded'` ledger rows award Sparks.
- **RLS.** Every new table has RLS enabled with explicit per-operation policies (CLAUDE.md rule 7).
  - `child_progress`, `child_badges`, `spark_events`: SELECT for self or the child's parent.
  - `child_activity_days`: SELECT for self only.
  - All writes are denied. `revoke all from anon`; `revoke insert, update, delete, truncate from authenticated`.
- **Functions** are all `security definer` with `set search_path = ''`. Internal functions get `revoke execute … from public, anon, authenticated`.
- An award failure must never block a money write. Each trigger body wraps the award in `begin … exception when others then raise warning …; end`.
- **Lock order:** any source lock (ledger advisory lock, attempt row) is taken first, and the `child_progress` row is locked last.
- **Copy rule for children:** short, encouraging, never shaming.

## Review Focus

1. **Two inserts race for the 3rd log of the day.** Exactly one is awarded and the cap stays exact (Task 4, pgTAP: sequential calls under the row lock plus the `unique (child_id, source_key)` replay).
2. **A purchase is undone and logged again.** The original Sparks stay, the reversal awards nothing, and the slot isn't freed. A fix (`corrects_entry_id`) awards nothing (Task 4).
3. **Check-in near midnight in a non-UTC family timezone** lands on the family-local day (Task 4, `daily_checkin_at`).
4. **A goal created already past 50%, or a target lowered.** It pays 0 for milestones already passed and never pays them later (Task 4).
5. **An award bug.** The trigger guard keeps the purchase or deposit committed (Task 4: force an error by calling with a non-child id and check the ledger row exists).

---

## Design Reference (from supabase-architect; binding)

**Hook points (existing functions):**
- Purchase: `record_purchase(_at)` in `20261102000000_diary_complete.sql` writes `ledger_entries` kind `purchase`, source `diary`, mode `recorded`.
- Money got: `record_money_received(_at)` writes kind `gift_in`, source `diary`.
- Undo writes a `reversal`. A fix writes a reversal plus a new row with `corrects_entry_id`.
- Deposit: posted only by `post_request` (latest body in `20261031060000_emergency_funds.sql`), which writes `deposit_out` and `deposit_in` with keys `request:<id>:out|in`.
- Step: `record_step_result` (`20261030100000_learning_progress.sql`) writes `step_results`. `complete_mission` sets `mission_attempts.status = 'completed'`.
- Goal: `goal_progress(child)` (`20261031023826_goals.sql`) computes counted = balance(save) − reserved_save.
- Day: `family_today(family_id, now)` (`20261029130002_allowance_schedules.sql`).
- Do not reuse `learning_checkins`, which is the one-off FR10 check-in.

**Tables:**

```sql
child_progress (
  child_id uuid primary key references profiles on delete cascade,
  family_id uuid not null references families on delete cascade,
  sparks bigint not null default 0 check (sparks >= 0),
  level smallint not null default 1 check (level between 1 and 10),
  streak int not null default 0 check (streak >= 0),
  best_streak int not null default 0 check (best_streak >= 0),
  last_active_day date,
  rest_week date,                         -- Monday of the week whose rest day is used
  lid text not null default 'cyan' check (lid in ('cyan','grape','blush','green','ink')),
  wear text not null default 'none' check (wear in ('none','cap','shades','headphones','crown')),
  logs_count int not null default 0 check (logs_count >= 0),
  saves_count int not null default 0 check (saves_count >= 0),
  steps_count int not null default 0 check (steps_count >= 0),
  checkins_count int not null default 0 check (checkins_count >= 0),
  missions_count int not null default 0 check (missions_count >= 0),
  goals_reached_count int not null default 0 check (goals_reached_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),   -- + existing set_updated_at trigger
  constraint child_progress_wear_unlocked check (public.progress_wear_level(wear) <= level)
)

child_activity_days (
  child_id uuid not null references profiles on delete cascade,
  family_id uuid not null references families on delete cascade,
  day date not null,
  checkin text check (checkin in ('yes','nope')),
  logs smallint not null default 0,
  saves smallint not null default 0,
  steps smallint not null default 0,
  goal_awards smallint not null default 0,
  active boolean generated always as (checkin is not null or logs > 0 or steps > 0) stored,
  primary key (child_id, day)
)

spark_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles on delete cascade,
  family_id uuid not null references families on delete cascade,
  kind text not null check (kind in ('log','checkin','step','save','goal_milestone','goal_reached')),
  amount int not null check (amount between 0 and 100),
  source_key text not null check (char_length(source_key) <= 200),
  day date not null,
  created_at timestamptz not null default now(),
  unique (child_id, source_key)
)  -- index (child_id, created_at desc)

child_badges (
  child_id uuid not null references profiles on delete cascade,
  family_id uuid not null references families on delete cascade,
  badge_key text not null check (badge_key ~ '^[a-z0-9_]{1,40}$'),
  earned_at timestamptz not null default now(),
  primary key (child_id, badge_key)
)
```

- Every table gets an index on `family_id`.
- The migration backfills a zero `child_progress` row for each approved child.
- `profiles.child_facing_name text check (child_facing_name is null or (char_length(child_facing_name) between 1 and 20 and child_facing_name = btrim(child_facing_name)))`, plus `grant update (child_facing_name) on profiles to authenticated`. The existing policy limits updates to a parent's own row. Children already read their parents' rows.

**Functions:**
- `progress_level(p_sparks bigint) returns smallint` and `progress_wear_level(p_wear text) returns smallint`: immutable SQL mirrors of the constants.
- `progress_lock(p_child_id uuid) returns public.child_progress` (internal): insert-on-conflict-do-nothing, then `select … for update`. Returns null when the id isn't an approved child.
- `progress_award(p_child_id uuid, p_kind text, p_source_key text, p_amount int, p_now timestamptz default now()) returns int` (internal):
  1. Lock the row.
  2. Set `day := family_today(...)`.
  3. Upsert the activity day and bump its counter for the kind. The counter always counts toward the streak.
  4. Over the cap, return 0 with no event.
  5. `insert spark_events … on conflict do nothing`. If nothing was inserted, return 0.
  6. Add the Sparks, recompute the level, refresh the streak and `best_streak`, and bump the kind counter.
  7. Call `progress_check_badges`.
  8. Return the amount.
- `progress_mark_active(p_child_id uuid, p_kind text, p_now timestamptz default now()) returns void` (internal): marks the day active with no Sparks. Used for steps over the cap and for replay phases.
- `progress_streak(p_child_id uuid, p_today date) returns table(streak int, rest_used_this_week boolean)` (internal, stable). It implements this algorithm:

  ```
  d := today; if not active(today) then d := today - 1
  streak := 0; covered := {}
  loop (max 400):
    if active(d): streak++, d--
    elsif week(d) not in covered and active(d - 1): covered += week(d), d--
    else exit
  rest_used_this_week := week(today) in covered
  ```

- `progress_check_goal(p_child_id uuid, p_award boolean) returns void` (internal):
  - Reads `goal_progress`.
  - For each of 25/50/75/100 reached, inserts or awards the key `goal:<goal_id>:<pct>`. The amount is 25, or 0 when `p_award` is false.
  - At 100% it also awards `goal_reached:<goal_id>` with 100, subject to the 7-day cap.
- `progress_check_badges(p_child_id uuid, p_day date) returns void` (internal): grants badges from the counters, `best_streak`, the level, the presence of a goal and goal %, and `diary_week` (logs on 7 consecutive days). Uses `insert … on conflict do nothing`.
- `daily_checkin(p_answer text) returns jsonb`, for a child only. It delegates to the internal `daily_checkin_at(p_answer text, p_now timestamptz)`.
  - It sets `checkin` on today's activity row, using the first answer of the day.
  - It awards 5 with the key `checkin:<day>`.
  - It returns `{status: 'recorded'|'already', sparks: int}`.
  - It never writes a ledger row.
- `set_jarso_look(p_lid text, p_wear text) returns void`, for a child only. It raises `22023` on an unknown value and `JA409 'Not unlocked yet'` on a locked outfit.
- `get_progress(p_child_id uuid) returns jsonb`, stable. It requires `is_self` or `is_parent_of`, otherwise it raises `JA403`. It returns:

  ```
  {sparks, level, nextLevelAt (null at 10), streak, bestStreak, restUsedThisWeek,
   checkedInToday, look: {lid, wear}, badges: [{key, earnedAt}],
   recent: [{kind, amount, createdAt}] (last 10 events with amount > 0)}
  ```

  `streak` is computed live through `progress_streak`.

**Triggers** (in the migration `progress_awards`):
- **`progress_on_ledger_entry`.** Fires `after insert on ledger_entries for each row when (new.mode = 'recorded' and (new.kind in ('purchase','gift_in','deposit_in') or new.jar = 'save'))`.
  - `purchase`, or `gift_in` from `diary`, with `corrects_entry_id is null`: log award, key `log:<entry_id>`.
  - `deposit_in`: save award, key `save:<source_id>`.
  - Any recorded save-jar row: `progress_check_goal(child, true)`.
- **`progress_on_step_result`.** Fires after insert on `step_results`.
  - Phase `main`: award 15, key `step:<mission_key>:<step_key>`.
  - Any other phase: `progress_mark_active` only.
- **`progress_on_mission_completed`.** Fires after update of `status` on `mission_attempts` when it becomes `completed`. It bumps `missions_count` and checks badges.
- **`progress_on_goal_change`.** Fires after insert, or after an update of `target_minor`, on `goals`. Calls `progress_check_goal(child, false)`.

Migrations:
- `20261106120000_child_facing_name.sql`
- `20261106120100_progress.sql` (tables, RLS, mirrors, lock, award, streak, badges, backfill)
- `20261106120200_progress_awards.sql` (triggers, check-in, look, `get_progress`, grants)

Before writing each trigger, read the actual column names (`ledger_entries`, `step_results`, `mission_attempts`, `goals`) from the migrations. Where the design and the schema disagree, the schema wins; record the difference in the report.

---

### Task 1: `@jarso/core/progress`

**Files:**
- Create `packages/core/src/progress/{index.ts, rules.ts, badges.ts, schemas.ts, copy.ts}`
- Modify `packages/core/package.json` (exports `"./progress"`)
- Test `packages/core/tests/progress/{rules,badges,schemas}.test.ts`

**Interfaces (produces):**
- Value and cap constants:
  - `SPARKS = { log: 10, checkin: 5, step: 15, save: 20, goalMilestone: 25, goalReached: 100 } as const`
  - `DAILY_CAPS = { log: 3, checkin: 1, step: 20, save: 2 } as const`
  - `GOAL_REACHED_COOLDOWN_DAYS = 7`
- Level constants and helpers:
  - `LEVEL_THRESHOLDS: readonly number[]` (the 10 values) and `LEVEL_NAMES: readonly string[]` (the 10 names)
  - `levelFor(sparks: number): number` returns 1–10. Negative or NaN gives 1.
  - `levelProgress(sparks: number): { level: number; name: string; nextAt: number | null; toNext: number | null; share: number }`. `share` is 0..1 within the current level, and 1 at level 10.
- Badges:
  - `BADGE_KEYS` (the 23 keys, `as const`) and `type BadgeKey`
  - `BADGES: Record<BadgeKey, { name: string; how: string; icon: string }>`. `name` is 1–3 words. `how` is at most 8 words in second person, such as "Write down 10 things". `icon` is a lucide name.
- Schemas:
  - `progressSchema`, a Zod schema for the `get_progress` JSON above (camelCase), with `type Progress = z.infer<…>`. Badge keys it doesn't know are dropped, not fatal.
  - `checkinAnswerSchema = z.enum(["yes", "nope"])`
  - `childFacingNameSchema`: trimmed, 1–20 characters, optional or null.
- Copy and wear:
  - `parentLabel(name: string | null | undefined): string` returns the name, or `"your parent"`.
  - `progressCopy`, the child-facing strings needed now: `checkinQuestion: "Spend anything today?"`, `nope: "Nope"`, `yes: "Yes"`, `restDay: "1 free rest day a week"`, `levelUp: (n, name) => \`Level ${n}! ${name}\``, and `streakDays: (n) => \`${n} days\``. Never write "lost" or "broken".
  - Re-export nothing from mascot. Add `wearForLevel(level)` here, delegating to `availableWear` from `@jarso/core/mascot`.

- [ ] **Step 1: Write the failing tests.**
  - `levelFor`: 0→1, 99→1, 100→2, 3199→9, 3200→10, 99999→10, -5→1.
  - `levelProgress(175)` gives `{level:2, nextAt:250, toNext:75, share:0.5}`. `levelProgress(5000)` gives `nextAt: null`, `share: 1`.
  - `BADGE_KEYS.length === 23`, and every key matches `/^[a-z0-9_]{1,40}$/`.
  - Every `BADGES[k].how` has at most 8 words.
  - `progressSchema` parses a full sample and drops an unknown badge key.
  - `parentLabel(null) === "your parent"`. `childFacingNameSchema` rejects `""` and a 21-character string, and trims `" Mum "` to `"Mum"`.
  - No `progressCopy` string contains "lost", "broke" or "fail".
- [ ] **Step 2: Run them.** Command: `pnpm --filter @jarso/core test -- tests/progress`. Expected result: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them again.** Expected result: PASS. Also run `pnpm --filter @jarso/core typecheck` and Biome on the new files.
- [ ] **Step 5: Commit.** Message: `feat(core): progress rules (sparks, levels, badges)`.

### Task 2: Migration `child_facing_name`

**Files:**
- Create `supabase/migrations/20261106120000_child_facing_name.sql` and `supabase/tests/database/child_facing_name.test.sql`

- [ ] **Step 1: Write the pgTAP file** first, following the style of `supabase/tests/database/welcome_tour.test.sql`. Cases:
  - A parent updates their own `child_facing_name` to "Mum".
  - "" is rejected with `23514`, and so is a 21-character name.
  - " Mum" is rejected because it isn't trimmed.
  - A parent can't update another parent's row (0 rows affected).
  - A child can't update it (`42501`, or 0 rows).
  - A child reads their parent's `child_facing_name`.
- [ ] **Step 2: Write the migration.** Add the column, the check and the column grant. Read the existing profiles policies and grants to confirm that a column-level grant is the right mechanism. If profiles updates go through a function instead, extend that function and record the change.
- [ ] **Step 3: Static checks.** Run `pnpm exec supabase db push --linked --dry-run`. Expected result: it lists only this branch's new migration files as pending (the dry run applies nothing). Re-read the SQL against the profiles schema.
- [ ] **Step 4: Commit.** Message: `feat(db): child-facing parent name`.

### Task 3: Migration `progress` (tables, mirrors, award engine, streak, badges)

**Files:**
- Create `supabase/migrations/20261106120100_progress.sql` and `supabase/tests/database/{progress,progress_streak}.test.sql`

**Interfaces (produces for Task 4):** the four tables, plus `progress_level`, `progress_wear_level`, `progress_lock`, `progress_award`, `progress_mark_active`, `progress_streak`, `progress_check_goal` and `progress_check_badges`, with the signatures given in the Design Reference.

- [ ] **Step 1: Write the pgTAP files.**
  - `progress.test.sql`:
    - `has_table` for the four tables, and RLS enabled on each.
    - Two families, siblings and a parent. Each child sees only their own `child_progress`, `child_badges` and `spark_events`; their parent sees their rows; the parent sees no `child_activity_days`.
    - Direct inserts or updates by `authenticated` fail with `42501`.
    - `progress_level` returns 1, 2, 10 for 0, 100, 3200.
    - `progress_wear_level('crown') = 5`.
    - The constraint rejects `wear='crown'` at level 4 (as postgres).
    - Calling `progress_award` as postgres: the first log gives 10; the 4th log that day gives 0 and writes no event; a repeated `source_key` gives 0; the badge `first_log` is granted.
    - The backfill created a row for the seeded child.
  - `progress_streak.test.sql`. Seed `child_activity_days` as postgres, then check:
    - 3 consecutive days give a streak of 3.
    - Today inactive with yesterday active still gives a streak that counts yesterday.
    - One missed day in a week, with the day before active, keeps the streak (rest used = true).
    - A second miss in the same week ends it.
    - Two consecutive misses end it.
    - A miss on Sunday followed by Monday uses that week's rest day correctly.
    - After a break, a new active day gives 1.
- [ ] **Step 2: Write the migration** exactly per the Design Reference. Include RLS policies per operation, indexes, the backfill, and revokes.
- [ ] **Step 3: Static checks.** Re-read every referenced column and function against the existing migrations (`families.timezone`, `family_members` approval columns, `goal_progress` output columns, the `set_updated_at` trigger function name). Run `pnpm exec supabase db push --linked --dry-run`.
- [ ] **Step 4: Commit.** Message: `feat(db): progress tables and award engine`.

### Task 4: Migration `progress_awards` (triggers, check-in, look, read model)

**Files:**
- Create `supabase/migrations/20261106120200_progress_awards.sql` and `supabase/tests/database/progress_awards.test.sql`

**Interfaces:**
- Consumes the Task 3 functions.
- Produces these RPCs:
  - `daily_checkin(p_answer text) returns jsonb`
  - `set_jarso_look(p_lid text, p_wear text) returns void`
  - `get_progress(p_child_id uuid) returns jsonb`
  - plus the internal `daily_checkin_at(p_answer text, p_now timestamptz)`

- [ ] **Step 1: Write the pgTAP file.** Use the real recording functions as the child, the way existing diary and request tests do. Cases:
  - **Logs:**
    - A purchase gives +10. Three more purchases the same day: the 4th gives 0.
    - Undo keeps the Sparks.
    - Fixing an entry adds 0.
    - The same purchase key retried doesn't award twice.
    - Money got gives +10.
    - A practice-mode row gives 0.
  - **Saves:**
    - A deposit the parent confirms gives the child +20.
    - An auto-confirmed deposit gives +20.
    - The 3rd save in a day gives 0.
  - **Steps:**
    - A main-phase step gives +15.
    - The same step again, or a replay phase, gives 0 but the day is still active.
  - **Check-in:**
    - `daily_checkin('nope')` gives `{status:'recorded', sparks:5}` and no new `ledger_entries` row.
    - A second call returns `already`.
    - `daily_checkin_at` at 23:30 and at 00:30 local time, in a `Asia/Kolkata` family, lands on two different days.
  - **Goal:**
    - Crossing 25/50/75/100% pays 25 each, once.
    - Reaching 100% pays +100.
    - A goal created at 60% saved writes 0-Sparks events for 25 and 50, and later deposits never pay them.
    - Lowering the target pays nothing.
  - **Look:**
    - `set_jarso_look('grape','crown')` at level 1 raises `JA409`. `('grape','cap')` works.
    - An unknown lid raises `22023`.
    - A parent calling it raises `JA403` (child only).
  - **`get_progress`:**
    - Self works, the child's parent works, another family raises `JA403`.
    - The shape has every key in the Design Reference.
  - **Guard:** a trigger award failure doesn't roll back the purchase. Simulate it by temporarily revoking the child's progress row path, for example by deleting the family-membership approval as postgres between steps, or by using a child with no `child_progress` row and no approval. Then assert the ledger row exists.
- [ ] **Step 2: Write the migration** per the Design Reference. Grant execute on `daily_checkin`, `set_jarso_look` and `get_progress` to `authenticated`. Keep internal functions revoked.
- [ ] **Step 3: Static checks.** Read the current definitions of `post_request`, `record_step_result`, `complete_mission`, the `ledger_entries` columns (`mode`, `kind`, `jar`, `source`, `source_id`, `corrects_entry_id`, `child_id`) and the `goals` columns, and match the names exactly. Then run `pnpm exec supabase db push --linked --dry-run`.
- [ ] **Step 4: Commit.** Message: `feat(db): award sparks from money, lessons and goals`.

### Task 5: Types and `@jarso/data/progress`

**Files:**
- Modify `packages/db/src/database.types.ts`. Edit it by hand to match migrations 2–4 exactly, in the generator's format: the `child_progress`, `child_activity_days`, `spark_events` and `child_badges` tables, the `profiles.child_facing_name` column, and the Functions `daily_checkin`, `set_jarso_look` and `get_progress`. Internal functions are revoked but the generator still lists them, so include them too. After the user approves the push, regenerate with `pnpm db:types:linked`; the diff must be empty, or else reconciled.
- Create `packages/data/src/progress/{index.ts, repository.ts}`
- Modify `packages/data/package.json` (exports `"./progress"`)
- Modify `packages/data/src/profiles` or `family`: add `findParentLabels`, wherever parent rows are read today
- Test `packages/data/tests/progress/repository.test.ts`

**Interfaces (produces):**
- `getProgress(db: Client, childId: string): Promise<Progress>`. Calls the RPC `get_progress`, parses with `progressSchema`, and throws `toAppError` on error.
- `dailyCheckin(db: Client, answer: "yes" | "nope"): Promise<{ status: "recorded" | "already"; sparks: number }>`
- `setJarsoLook(db: Client, look: JarsoLook): Promise<void>`. Maps `JA409` to `AppError("VALIDATION", "Not unlocked yet")`.
- `findParentLabels(db: Client, childId: string): Promise<string[]>`. Returns the `child_facing_name` of each approved parent in the child's family (nulls dropped), in the order they were added.

- [ ] **Step 1: Write the failing tests** with `fakeClient`:
  - The RPC is called with `{ p_child_id: "c1" }` and the result is parsed.
  - An error throws an AppError.
  - `JA409` maps to VALIDATION "Not unlocked yet".
  - `dailyCheckin` calls the RPC with `{ p_answer: "nope" }`.
  - `findParentLabels` drops nulls.
- [ ] **Step 2: Run them.** Command: `pnpm --filter @jarso/data test -- tests/progress`. Expected result: FAIL.
- [ ] **Step 3: Implement it,** after the types edit.
- [ ] **Step 4: Run tests and typecheck.** Expected result: PASS. Command: `pnpm --filter @jarso/data test && pnpm --filter @jarso/data typecheck`.
- [ ] **Step 5: Commit.** Messages: `chore(db): types for progress`, then `feat(data): progress repository`.

### Task 6: Mobile hooks and cache refresh

**Files:**
- Create `apps/mobile/src/features/progress/{index.ts, use-progress.ts}`
- Modify `apps/mobile/src/lib/query.ts`: add `progress: (userId) => ["progress", userId] as const`
- Modify the existing mutation refresh helpers: the purchase, received, undo and fix flows in `features/diary`, requests (put-in), the goal mutations, and mission step recording in `features/learning`. After success they also invalidate `keys.progress(userId)`.
- Test `apps/mobile/tests/features/progress/use-progress.test.tsx`, plus one assertion added to an existing diary mutation test.

**Interfaces (produces for plans 3–6):**
- `useProgress()`: a `useQuery` on `keys.progress`, enabled when there's a child `userId`.
- `useDailyCheckin()`: a mutation that invalidates `keys.progress`.
- `useSetJarsoLook()`: a mutation that optimistically sets `look` in the cached progress, rolls back on error, and invalidates.
- `useParentLabel()`: returns the first label from `findParentLabels` through `parentLabel(...)`, with a 24 h stale time.

- [ ] **Step 1: Write the failing tests.** Mock `@jarso/data/progress`. Cases:
  - The query key is `["progress","u1"]`.
  - The check-in mutation invalidates progress.
  - The look mutation is optimistic and rolls back when it rejects.
  - `useParentLabel` falls back to "your parent".
  - Recording a purchase invalidates progress.
- [ ] **Step 2: Run them.** Command: `cd apps/mobile && pnpm exec jest --maxWorkers=2 tests/features/progress`. Expected result: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run them, plus the touched feature tests and typecheck.** Expected result: PASS.
- [ ] **Step 5: Commit.** Message: `feat(mobile): progress hooks`.

### Task 7: Docs

- [ ] Update `docs/database.md`: the four tables, the award triggers, the lock order (source lock, then `child_progress`), and the "award failure never blocks money" guard.
- [ ] Update `docs/domain.md`: add an invariant that Sparks are never money, never come from practice, and are never clawed back.
- [ ] Update `docs/api.md`: the three RPCs.
- [ ] Commit. Message: `docs: progress (sparks, levels, streak)`.

### Task 8: Gate, push approval, and type check

- [ ] Run `pnpm check`. Expected result: green.
- [ ] **STOP and ask the user** before running `pnpm exec supabase db push --linked`. After approval, run `pnpm db:types:linked` and confirm the generated types match the hand edit; reconcile any difference.
- [ ] The PR's CI runs pgTAP (`migrations` job). Fix any failure there.

# Mobile rework: a kids' app children want to open

Date: 2026-11-06. Status: approved 2026-11-06 (everything in this rework).
Mockups: `docs/superpowers/specs/mockups/2026-11-06-mobile-kid-rework.html` (every screen, 38 phones).

## Why

Review feedback on the Expo app:

1. Too much text. A 10–15 year old can't use it.
2. There's no mascot, so it doesn't look like a kids' app.
3. The visuals don't feel like a child's app.
4. Home is hard to understand. The action labels ("Put some in Save", "Take some out", "Move my money") don't mean anything to a child, and the line graph isn't readable.
5. The whole app needs rework. It should be fun to come back to, not boring. Parents and children need a real onboarding that teaches the ideas as simply as possible.

What we found in the current app:

- Home shows 120–180 words and 6 action labels in two places.
- "Move my money" opens a history list that moves nothing.
- There's no drawn character at all. `CoachSays` is a text bubble.
- Success is an Android toast.
- Parents can't create an account on the phone.

## Research behind it (short)

- **NN/g teen and kids studies.** Teens give up fast and read badly under impatience. Under-12s read instructions literally and need real-world mental models. Anything that looks "for babies" gets rejected.
- **Graph literacy.** Children read pictograms and bar charts best and double line graphs worst. That's why the money ride goes.
- **Pedagogical-agent meta-analyses.** Emotional, animated characters help motivation and learning by about g≈0.26, and short text bubbles beat narration.
- **Goal-gradient effect.** People speed up near a goal, and a head start helps. That's why there's a default Save split and goal milestone stars.
- **Duolingo.** Streaks raise next-day return about 2.4×, and a freeze (slack) motivates more than strict rules.
- **Ethics.** The loot-box harm research, the ICO Children's Code and India's DPDP Act (no behavioural nudging of minors) are why the loop is fixed-reward and guilt-free.

Sources are listed in the research notes at the end.

## Goals

- **Home in 3 seconds.** A child sees how much they have, what they're saving for, and what to do today.
- **Word budget on the child side.**
  - Labels are 1–3 words.
  - Jarso's bubble is at most 8 words.
  - Home stays at or under 30 words.
  - No paragraph anywhere.
- **Money actions named after real moments.** All of them sit behind one + button.
- **A mascot with moods** that reacts to everything the child does.
- **Pictures instead of charts:** filling jars, goal rings, weekly bars with the number on each bar.
- **A fun loop that rewards good money habits:** Sparks, levels, badges, a forgiving streak, a daily check-in, celebrations.
- **Onboarding for parents and children** that teaches the jars by doing them.

## Non-goals

- No domain change. Requests, approvals, rules, ledger, outbox and invariants stay as in `docs/domain.md`.
- No new money features. Sparks are never money and can never become money.
- The web app is out of scope. It keeps its design for now. Shared copy changes in `packages/core` will reach it, and that's intended.

## Anti-goals (a failure even if it works)

- Babyish looks: primary-colour clown style, baby proportions, cutesy voice.
- Manipulation:
  - random or chance rewards
  - paid boosts
  - guilt or sad-mascot messages
  - shame when a streak is lost
  - endless feeds
  - pushes after 20:00 local time
  - spend-to-earn
  - celebrating spending as such
- Hiding the real-world step. "Save some" must still say you hand the cash to your parent.

## Decisions

### Mascot: Jarso comes alive

- **What it is.** The brand mark (same outline, lid and lid coin as `jar-outline.ts`) gets eyes (the existing `JarsoEyes` geometry), a mouth, arms and feet.
- **Moods.** Six: happy, cheer, wow, think, wave, sleepy. Never sad.
- **It is the Save jar.** The gold inside fills to the child's Save level.
- **Customising.** Lid colour plus one accessory (cap, shades, crown…). Accessories unlock by level.
- **Coaches on mobile.** Jarso replaces the four coach kids on the phone. One character keeps it simple. The web keeps its coaches.
- **Drawing and motion.** `react-native-svg` plus Reanimated, both already installed. Mood changes are code-driven state, not video files.
- **Voice.** Jarso's line is spoken with the device voice (or a recording) on onboarding and lesson feedback, with a mute button.

### Navigation (child)

- **Tabs:** Home · Learn · **+** · Diary · Jarso.
- **The + button** is a raised gold keycap that opens the "What happened?" sheet.
- **Notifications** move from a tab to the bell on Home.
- **Me** opens from the avatar.

### Home

The blocks, in order:

1. Header: avatar, streak, Sparks, bell.
2. Jarso hero with one bubble line. The existing graph caption logic becomes the bubble.
3. Spend and Save tiles. Tap one to open its jar page.
4. The goal (ring + bar + "₹110 to go").
5. Today's mission (Play).

When something is happening, moment cards slide in above the jars and the hero hides: allowance due, an ask waiting, a "yes". A moment card is at most 2 lines.

Removed from Home:

- The list card.
- The line graph.
- The push-permission card. It moves to after the first ask is sent: "Want to hear when Mum answers?"

### Money actions (names)

| Today | New | Sub-hint |
|---|---|---|
| Spent something? | I bought something | From Spend |
| Got money | I got money | Gift, pay, found |
| Put some in Save | Save some | Give cash to Mum |
| Take some out | Use savings | Ask Mum for it |
| Ask for extra | Ask for extra | Need a bit more? |
| Move my money | My asks | (list) |

"Mum" is the name the parent picks in onboarding ("Your child calls you"). It falls back to "your parent". This needs one new parent profile field: `child_facing_name` (short text, optional). It needs a migration.

### Flows

- **Shape.** Every flow is how much (big keypad + quick chips) → what for (3×3 picture grid) → celebration.
- **Rules and limits** show as one chip ("You can ask up to ₹200").
- **PredictStep** becomes Jarso's one-tap guess on the Save some / Use savings amount screen: "Your boots get… Further / Closer". It uses the same core logic, and the long explanation goes.
- **Waiting asks** show a 3-step tracker (done / now / next), like a delivery tracker.
- **Success** is a full-screen or sheet celebration with confetti, sound, a haptic, and Sparks and streak ticking up. It replaces `flash()` toasts. Undo stays where it exists today.

### Jars and goal

- **Jar page** (new, one per jar):
  - a big jar
  - 6 weekly bars with the amount on each bar
  - one sentence ("₹50 more than last week!")
  - the jar's two actions
- **The line graph.** `JarGraph` leaves the child app. The bars use the same balance history from core.
- **Goal:**
  - a big ring with the item
  - four milestone stars (25/50/75/100) that light up with a cheer
  - "₹X to go · about N weeks"
  - Goal reached is a full celebration, then "Ask Mum to buy them".

### Learn

- **Quest map.** Each week is a winding path of 7 stops, with Jarso standing on today's stop and a chest at the end (a badge and a look, never money).
- **Questions.** Picture answers, a one-line prompt, and a Jarso hint bubble.
- **Right answer.** A green sheet and a cheer.
- **Wrong answer.** A calm blue sheet: "Close! Try again". No red.
- **Daily check-in.** On the first open of the day, Jarso asks "Spend anything today?" with Nope / Yes.
  - Yes opens "I bought something".
  - It keeps the diary true and counts for the streak.

### Fun loop (engagement without manipulation)

- **Sparks ⚡.** Fixed amounts:
  - log a purchase or money got: +10
  - check-in: +5
  - a mission step: +15
  - a save: +20
  - goal milestones: +25 each
  - goal reached: +100

  Daily caps stop farming (my call: at most 3 logs count per day).
- **Levels.** Every level is a Sparks threshold and unlocks one Jarso look. They're named (Jar Starter, Coin Keeper, Money Maker…).
- **Badges.** About 20 named badges for habits, such as a first save, a 7-day streak, a goal reached, or a diary kept for a week.
- **Streak.**
  - What counts: any check-in, log or mission on a day.
  - One automatic rest day per week covers a miss.
  - A broken streak is never mentioned. The child just starts at 1.
- **Pushes.**
  - Only events: an answer from a parent, allowance day, a note.
  - Plus at most one gentle daily reminder, which the parent can turn off. Never after 20:00.
- **Parents** see level and streak on the child card. There's no leaderboard and no comparing between children.

### Onboarding

**Parent (7 steps, on the phone; new: sign-up moves from web-only to mobile).**

1. Welcome and role pick.
2. "How Jarso works" in three swipe cards: Two jars · They ask, you hand over · A mission a day.
3. Account, including "Your child calls you". Email is verified with a 6-digit code (OTP) so it completes in-app.
4. Add a child: nickname, PIN, consent, and "Only a nickname. No email, surname or birthday."
5. Pocket money: amount, how often, start date and a Spend/Save split. The split is new and needs core and allowance support (ADR).
6. Freedom presets. These map onto the existing rules:
   - "Ask me every time" = approve.
   - "Small ones: just tell me" = notify under a cap.
   - "Sam decides" = auto.
7. A share card with the family code and nickname, and a QR code. The PIN is never shown again.

**Child (about 2 minutes, skippable, replay from Me).**

1. Sign in, with QR scan first and a PIN pad.
2. Meet Jarso.
3. "This is Spend": tap a snack and the practice ₹100 ticks down.
4. "This is Save": drag a coin into Save. It says once that for real you hand the cash to Mum.
5. Pick a goal (real, saved), showing "about N weeks".
6. Make Jarso yours.
7. Celebration: first badge and +50 Sparks.

Practice money is labelled PRACTICE and never touches the ledger, in line with the invariant that practice and recorded money never mix.

### Parent app

- **Visual system.** Same tokens, keycaps and Jarso. Calmer: no Sparks, no confetti, denser text is fine.
- **Family.** Asks are answered in one tap on their card ("Got it" / "Not yet", "Yes" / "Not now").
- **Child card.** Jarso, learning in one line, and three money tiles.
- **Unchanged.** Handover, rules, allowance and the hub keep their function and take the new look.

### Visual system changes

These go into `packages/brand/tokens.ts` and the mobile Tailwind config:

- **Keycap buttons.** A coloured block with a 5 px darker ledge, in four colours: teal, gold, grape, white.
- **Bolder surfaces.** The Spend tile is solid teal-600 and the Save tile solid gold. Gradient heroes go on celebration screens.
- **Grape** is used for missions, levels and Sparks. It's already a token, so there's still one meaning per colour: teal is action and Spend, gold is money and Save, grape is learning and progress.
- **Radius:** 24 for cards, 18 for buttons.
- **Type:** Nunito 800/900 for headings, and child-side body text is at least 16.
- **Icons.** Lucide icons inside rounded tinted squares or circles.
- **Emoji.** Only for child-picked goal items and category art in lesson questions.
- **Motion.** Reanimated (bounce-in, coin flying into a jar, confetti, number ticking) plus `expo-haptics`. Short sounds use `expo-audio` (new dependency).
- **Reduced motion and sound.** The OS reduce-motion setting turns off confetti and bounces. Sound has a toggle in Me.

## Data and backend implications

- **Migration: `profiles.child_facing_name`** (or a family-level field), editable in parent settings.
- **Migration: progress tables.**
  - `child_progress`: Sparks, level, streak, last active day, rest day used this week, Jarso look.
  - `child_badges`.
  - Sparks are awarded server-side in the same database functions that record the action, so they can't be farmed from the client. Fixed values live in `packages/core/src/progress`.
  - RLS: the child reads their own rows, the parent reads their child's, and only Postgres functions write.
- **Daily check-in "Nope".** It writes a check-in row only, never a ledger row.
- **Mobile sign-up.** Uses Supabase `signUp` from the app, plus the OTP email template. `docs/auth.md` and the confirmation template need a code variant.
- **Allowance split.** Allowance due items would carry a split. It touches the allowance domain, so it gets a separate ADR.

## Left to the builder

- Exact Sparks values and level thresholds. The constants live in core and the tests cover them.
- The badge list beyond the 10 named in the mockups.
- Jarso's animation timings, as long as they follow design.md §8 (light, never looping except idle blink).
- Which sounds to use. They must be short (under 1 s), and there's a mute toggle.
- Splitting the work into waves. Suggested order:
  1. Visual system and Jarso component.
  2. Home, the + sheet and the flows.
  3. Jar and goal pages.
  4. Learn map and check-in.
  5. Sparks, levels and badges (backend).
  6. Child onboarding.
  7. Parent onboarding and sign-up.
  8. Parent restyle.

## Decided (2026-11-06)

1. Jarso replaces the four coach kids on mobile (my call; user did not object). Web keeps the coaches.
2. The allowance Spend/Save split ships in this rework (user). It gets its own ADR.
3. Parent sign-up on the phone ships in this rework (user).

## Research notes (sources)

- NN/g teens: https://www.nngroup.com/reports/teenagers-on-the-web/
- NN/g kids cognition: https://www.nngroup.com/articles/kids-cognition/
- NN/g physical development: https://www.nngroup.com/articles/children-ux-physical-development/
- Age calibration ("for babies"): https://www.infoworld.com/article/2225267/many-web-sites-aren-t-designed-well-for-kids.html
- Children's graph reading: https://funes.uniandes.edu.co/wp-content/uploads/tainacan-items/32454/1197370/Arteaga2020Chilean.pdf, https://open.lnu.se/index.php/PFS/article/download/1073/924/2671
- Goal-gradient: https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf
- Pedagogical agents: https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/How-Effective-are-Pedagogical-Agents-for/99900601056901842
- Duolingo streaks: https://blog.duolingo.com/how-duolingo-streak-builds-habit, https://blog.duolingo.com/improving-the-streak
- Loot-box harm to children: https://www.ncl.ac.uk/press/articles/latest/2022/11/lootboxes/
- Child finance apps critique: https://d2pnhgckm19p0r.cloudfront.net/insight/content/doi/10.1108/YC-01-2024-1954/full/pdf
- Competitors: Greenlight (https://logicaldollar.com/?p=6710), Rooster Money (https://roostermoney.com/introducing-spend-save-give), Revolut <18 (https://www.revolut.com/blog/post/revolut-under-18-the-account-built-for-teens/)

# Features

Every feature a child or parent can use in Jarso today, written from the code, with its main code paths and, in brackets, the pull request that added it.

## Child (web)

**Kids sign in.** A child signs in with the family code, their nickname and a PIN, so no child email is ever collected. Five wrong PINs from one place lock that place out for 15 minutes, doubling with each lock up to a day, and a parent's PIN reset clears every lock (#10). `apps/web/src/app/(auth)/sign-in/child`, `apps/web/src/features/family/server/child-auth.ts`, `supabase/migrations/20261029013254_harden_onboarding.sql`

**Start here.** A child can ask to join by giving a nickname and a parent's email. The parent gets an email with a link and a short code that last 7 days (#10). `apps/web/src/app/(auth)/start`, `apps/web/src/features/family/server/service.ts`, `supabase/migrations/20261028182920_invitations.sql`

**Home.** One screen with the Spend and Save jars, the next pocket money, the savings goal, the next learning step on a mini lesson road, and the child's run and points. Clear headings and line icons keep it short (#42, #57, #140). `apps/web/src/app/(app)/child/page.tsx`

**Spend and Save jars.** The jars are drawn as real jars on one shared scale, with every amount also in words. Coins fly between the jars when money moves, and tapping a jar opens its tray of actions (#57, #67). `apps/web/src/features/ledger/components/jar-shelf.tsx`, `packages/core/src/ledger/coin-flight.ts`, `packages/core/src/ledger/jar-scale.ts`

**Allowance-day plan card.** On the day pocket money lands, Jarso suggests how much of the Spend part to tuck into Save, shown as a split bar with one line from the coach. "Do it" makes the move in one tap, and the plan never suggests more than Spend holds (#86). `apps/web/src/features/requests/components/allowance-plan-card.tsx`, `packages/core/src/guide/allowance-plan.ts`, `supabase/migrations/20261103120000_allowance_plan.sql`

**Savings goal as a coin staircase.** The child names a goal, picks an emoji, sets a price and their own saving plan per allowance. The goal climbs a staircase of coins, one step per allowance, with the item on the top step, the child's coach on the step they have reached and an "about N more allowances" estimate (#41). `apps/web/src/app/(app)/child/goal`, `apps/web/src/features/goals`, `packages/core/src/goals/staircase.ts`, `supabase/migrations/20261031023826_goals.sql`

**Goal reached moment.** When Save covers the goal, Home shows a one-time "Saved up" moment. The goal can be swapped or put away at any time (#41). `apps/web/src/features/learning/components/home-step-card.tsx`, `packages/core/src/goals/copy.ts`

**Requests.** The child can ask to take money out of Save, put money into Save, or ask for extra money in an emergency, each with a reason. Requests show under the jar they affect, wait for the parent's answer and can be cancelled while they wait (#40, #45). `apps/web/src/app/(app)/child/requests`, `apps/web/src/features/requests`, `supabase/migrations/20261031020001_request_functions.sql`, `supabase/migrations/20261031060000_emergency_funds.sql`

**Jar moves that just happen.** When a parent picks "Just tell me", take-outs and put-ins are recorded at once and the parent gets a note, and the jar trays say so (#62). `apps/web/src/features/rules/components/jar-moves-choice.tsx`, `supabase/migrations/20261102123022_jar_moves_notify.sql`

**Predict before deciding.** Before setting a goal or moving money in or out of Save, the child guesses what the move does to their goal, then sees the real answer and a what-if slider (#46). `apps/web/src/features/goals/components/predict-step.tsx`, `packages/core/src/goals/predict.ts`

**Money diary.** The child writes down what they bought, with a what-for chip (snacks, games, clothes, going out, a gift, school, travel, apps, other), and money they received (family, birthday, a job, something sold, found, other) into either jar (#30, #65). `apps/web/src/app/(app)/child/diary`, `apps/web/src/features/diary`, `supabase/migrations/20261102000000_diary_complete.sql`

**Diary fixes and versions.** A line can be undone within 24 hours or fixed within 7 days. A fix never rewrites history: it writes a new line linked to the old one, and the line shows "Fixed · was" with its earlier versions (#65). `apps/web/src/features/diary/components/entry-detail.tsx`, `apps/web/src/features/diary/components/fix-form.tsx`, `packages/core/src/diary/copy.ts`

**Diary highlights.** Above the history, three figures read at a glance: this week's spending, the money that came in and what most of it went on. `apps/web/src/features/ledger/components/diary-highlights.tsx`

**Your money ride.** An interactive graph of both jars over this week, this month or 3 months, drawn as two tracks with the coach riding the busier one. It can be read by tap, pointer or arrow keys (#69). `apps/web/src/features/ledger/components/jar-graph.tsx`, `packages/core/src/ledger/balance-history.ts`, `packages/core/src/ledger/graph-geometry.ts`

**Notifications and big moments.** The child's Notifications page opens with their big moments from the last month (a mission finished, pocket money or a gift that came in, a goal reached, a new longest run), then their notices, which open the record they are about (#37, #43). `apps/web/src/app/(app)/child/inbox`, `apps/web/src/features/notifications/components/big-moments.tsx`, `packages/core/src/notifications/moments.ts`

**Welcome tour.** A first-time tour led by the child's own buddy: the child picks one of the four coaches, who walks them through Home, the jars, the goal, the diary, Learn, Jarso and Notifications with a recorded voice. It shows once per child on any device and can be replayed from Settings (#138). `apps/web/src/features/tour`, `packages/core/src/tour/steps.ts`, `apps/web/public/tour/voice`, `supabase/migrations/20261106100000_welcome_tour.sql`

**Coaches.** Four coach characters (Pip, Bo, Zuzu and Nell) appear across the child's screens with short, warm lines for greetings, empty states and goodbyes. The buddy picked on the tour coaches every lesson (#71, #77). `packages/core/src/learning/coaches.ts`, `packages/core/src/learning/coach-moments.ts`, `apps/web/src/components/brand/coach-says.tsx`

**Child settings.** The child chooses light, dark or "Same as my phone", turns sounds and browser notifications on or off, sees and forgets what Jarso remembers, replays the tour and signs out. `apps/web/src/app/(app)/child/settings`

## Parent (web)

**Parent accounts.** Parents sign up and sign in with email and password, then create the family with its currency and timezone. Seven currencies are supported: pound, euro, US dollar, rupee, Australian dollar, Canadian dollar and yen (#10). `apps/web/src/app/(auth)/signup`, `apps/web/src/app/(app)/parent/setup`, `packages/core/src/family/currency.ts`

**Profile completion.** Before acting, a parent adds their date of birth, country and gender in a dialog that stays until the details are saved (#17). `apps/web/src/features/profiles/components/profile-completion-dialog.tsx`, `supabase/migrations/20261029120000_parent_details.sql`

**Adding children.** A parent adds a child with a nickname and PIN, and shares the family code the child signs in with (#10). `apps/web/src/app/(app)/parent/children/new`, `apps/web/src/features/family/components/family-code-card.tsx`

**Invitations.** A parent approves a child's request to join by opening the emailed link, typing the short code, or picking it from their list of waiting invitations (#10, #12). `apps/web/src/app/(app)/invite`, `apps/web/src/features/family/components/invitation-list.tsx`, `supabase/migrations/20261029025041_list_my_invitations.sql`

**Home.** Needs you, Jarso's family summary, the lesson road with each child on it, the family's jars added up (or one child's, picked by chip), the family's goals, each child's learning and any requests waiting (#78, #115, #116, #121, #126). `apps/web/src/app/(app)/parent/page.tsx`, `apps/web/src/features/dashboard`

**Needs you.** One compact row per handover waiting, oldest first, with the child, what it is, when it was due, the amount and one action. With nothing waiting it becomes an "All caught up." chip (#42). `apps/web/src/features/allowance/components/needs-you.tsx`

**Children tab.** One card per child with their kid figure, name, run and points, then Learning (missions, the week, skills, practice, recent lessons) and Money (Spend, Save, goal and allowance) kept apart (#115, #126). `apps/web/src/app/(app)/parent/children/page.tsx`, `apps/web/src/features/dashboard/components/child-card.tsx`

**Money tab.** A child filter remembered on the device and a period switch re-scope the page: a money chart stacked by child, "Worth knowing" observations, spending by category against the period before, and the next two weeks of allowances, gifts and goals (#85, #116). `apps/web/src/app/(app)/parent/allowance/page.tsx`, `apps/web/src/features/dashboard/components/money-chart.tsx`, `apps/web/src/features/dashboard/components/category-compare.tsx`, `apps/web/src/features/dashboard/components/timeline-card.tsx`

**Child page.** Each child has a page with their jars, allowance, requests, learning, Jarso card and recent history in tabs (#19). `apps/web/src/app/(app)/parent/children/[childId]/page.tsx`

**Allowances.** Weekly, monthly, quarterly or yearly pocket money from a first date the parent picks. A parent can change it, pause it until a date or until resumed (with an optional message for the child), resume it or stop it (#18, #24). `apps/web/src/app/(app)/parent/children/[childId]/allowance`, `apps/web/src/features/allowance`, `supabase/migrations/20261029130002_allowance_schedules.sql`

**Gifts.** One-time gifts for today or a date up to a year ahead, with an optional note. A planned gift can be edited or cancelled before it is given (#18). `apps/web/src/app/(app)/parent/children/[childId]/gifts`, `supabase/migrations/20261029130005_parent_gifts.sql`

**Handover.** Money counts only once the parent hands it over. The handover splits what is due into cash for Spend and an amount for Save, and a due allowance can also be marked as not given (#18, #23). `apps/web/src/app/(app)/parent/children/[childId]/handover/[kind]/[id]`, `apps/web/src/features/allowance/components/handover-form.tsx`, `supabase/migrations/20261029130004_handover.sql`

**Answering requests.** The parent approves or declines take-outs and requests for extra money, hands over the cash, and confirms put-ins once they have the cash (#40, #45). `apps/web/src/features/requests/components/parent-request-items.tsx`

**Money rules.** Rules are written as sentences. Spending limits (each time, a week or a month) send the parent a note and never block a purchase; take-out caps, take-outs allowed without asking, and put-ins that count before the cash arrives; and a switch for whether Spend may go below zero (#30, #62). `apps/web/src/app/(app)/parent/children/[childId]/rules`, `apps/web/src/features/rules`, `packages/core/src/rules`, `supabase/migrations/20261029182402_money_rules.sql`

**Jar moves: "Ask me first" or "Just tell me".** The parent chooses whether the child's moves between jars wait for a yes or happen at once with a note. Asking for extra money always waits for the parent (#62). `apps/web/src/features/rules/components/jar-moves-choice.tsx`, `supabase/migrations/20261102123022_jar_moves_notify.sql`

**Match their saving.** When a child has saved money themselves, "Match it" adds the same amount (changeable) to their Save at once as a gift, with an optional note (#85). `apps/web/src/features/allowance/components/match-saving-sheet.tsx`, `apps/web/src/features/dashboard/components/callouts-card.tsx`

**Send a note.** A short note of up to 140 characters, started from a few ready lines, that lands in the child's Notifications (#85). `apps/web/src/features/notifications/components/send-note-sheet.tsx`, `supabase/migrations/20261103090000_parent_notes.sql`

**History and where the money went.** The child's full history, with a "Where your money went" card for the week (#55, #65). `apps/web/src/app/(app)/parent/children/[childId]/history`, `apps/web/src/features/ledger/components/where-it-went-card.tsx`, `packages/core/src/ledger/where-it-went.ts`

**Child's learning.** The lesson road, skill levels, the check-in summary and completed missions for one child (#28). `apps/web/src/app/(app)/parent/children/[childId]/learning`, `apps/web/src/features/learning/components/path-map.tsx`

**Parent notifications.** The parent's inbox plus a family activity list, each line tagged with its child (#37, #85). `apps/web/src/app/(app)/parent/inbox`, `apps/web/src/features/dashboard/components/activity-list.tsx`

**Parent settings.** Name and details, the family timezone and family code, each child (rename, PIN reset and removal, which keeps the family's records), saved cards, notifications, sounds and theme. Logging out asks first (#16, #85). `apps/web/src/app/(app)/parent/settings`, `apps/web/src/features/family/components/children-settings-list.tsx`, `supabase/migrations/20261029100000_family_settings.sql`

## Jarso the AI guide

**The Jarso page.** A full chat page with a greeting, starter cards, replies that type themselves out, and past chats in a History drawer with New chat (#80, #85). `apps/web/src/app/(app)/child/jarso`, `apps/web/src/features/guide/components/jarso-chat-page.tsx`, `apps/web/src/features/guide/components/chat-history.tsx`

**Jarso is thinking.** While Jarso works, coins drop into the jar and a short status line says what it is doing, such as looking at the jars or checking the numbers. Reduced motion keeps it still (#70, #85). `apps/web/src/features/guide/components/thinking-bubble.tsx`, `packages/core/src/guide/copy.ts`

**Jarso buddy.** Jarso floats in the corner of every child page and opens a chat in a side sheet, with a link to the full page (#80). `apps/web/src/features/guide/components/jarso-buddy.tsx`, `apps/web/src/features/guide/components/guide-sheet.tsx`

**Voice input.** A microphone beside Ask uses the browser's own speech recognition to fill the question box, and the child still presses Ask (#85). `apps/web/src/features/guide/components/voice-button.tsx`

**Reads the child's own data.** Jarso looks up the child's jars, allowance, money history, rules, learning, goal and requests, read only, and plans how long saving for a price takes. Every figure in a reply comes from those look-ups, never from the model's own numbers (#38, #44). `apps/web/src/features/guide/server/tool-specs.ts`, `apps/web/src/features/guide/server/tools.ts`, `apps/web/src/features/guide/server/pipeline.ts`

**Jarso prepares actions.** Jarso can prepare money received, a purchase, a move between jars or a savings request as a card. It asks one short question if something is missing, and nothing happens until the child taps "Do it" (#85). `apps/web/src/features/guide/components/proposal-card.tsx`, `apps/web/src/features/guide/server/do-action.ts`, `packages/core/src/guide/action-draft.ts`

**Goals from a chat.** Jarso can offer a savings goal as a card, and "Make it my goal" saves it once the child chooses. `apps/web/src/features/guide/components/proposal-card.tsx`

**Photo price check.** "Snap a price" takes a photo of a price tag or receipt, reads the main price with Claude Haiku and offers a goal for it. The photo is shrunk in the browser and never stored (#85). `apps/web/src/features/guide/components/photo-price-button.tsx`, `apps/web/src/features/guide/server/vision.ts`, `packages/core/src/guide/price-photo.ts`

**Help me and Why? in lessons.** Beside every lesson step, "Help me" opens Jarso already answering, and "Why?" explains a step once it is answered. Jarso guides with a question, then a small hint, then a stronger one, and gives the answer only after two tries (#29, #117, #127). `apps/web/src/features/guide/components/step-guide.tsx`, `apps/web/src/features/guide/server/prompts.ts`

**Rich replies.** A reply can carry what Jarso looked at, related topics, a quick check question and, for safety topics, helplines. `apps/web/src/features/guide/components/guide-reply.tsx`, `packages/core/src/config/helplines.ts`

**Memories.** Jarso keeps short facts a child shares (an interest, something they are saving towards, something they find tricky), up to 20 for 90 days. The child and their parents can see each one and Forget it (#47). `apps/web/src/features/guide/server/memory.ts`, `apps/web/src/features/guide/components/memory-list.tsx`, `supabase/migrations/20261031070000_guide_memories.sql`

**Jarso noticed.** A weekly nudge for each child about a goal milestone, a saving streak or a quiet spell, with a matching line for each parent, who also hears about a big jump in spending. At most one nudge a child in 6 days (#87). `apps/web/src/features/guide/server/noticed.ts`, `packages/core/src/guide/noticed.ts`, `apps/web/src/app/api/cron/guide/noticed/route.ts`, `supabase/migrations/20261103130000_guide_noticed.sql`

**Parents ask Jarso.** A parent has their own Jarso page to ask about a child, and Jarso can prepare a handover, a gift, an allowance change or a request decision for the parent to confirm (#80, #85). `apps/web/src/app/(app)/parent/jarso`, `apps/web/src/features/guide/server/tool-specs.ts`, `supabase/migrations/20261102120508_guide_parent_asker.sql`

**Parents read every chat.** Each child's chats are listed with flagged ones first. A parent sees what Jarso looked up, why a reply was held back and any thumbs up or down from the child, and can turn Jarso off for that child. Jarso is on by default (#38, #39, #70). `apps/web/src/app/(app)/parent/children/[childId]/guide`, `apps/web/src/features/guide/components/parent-views.tsx`, `supabase/migrations/20261031010000_jarso_on_by_default.sql`

**Jarso's family summary.** A few sentences on the children's learning this week at the top of the parent's Home, written by Claude Haiku from facts built in code and labelled as AI. It shows only when every number in it matches those facts (#85). `apps/web/src/features/guide/server/summary.ts`, `apps/web/src/features/dashboard/components/family-summary.tsx`, `packages/core/src/dashboard/summary.ts`

**Screened both ways.** Claude Sonnet 5.5 writes the answers and Claude Haiku 5.5 screens every question and every reply for off-topic, personal, safety and jailbreak content. Jarso never claims to have done something itself (#29, #85). `apps/web/src/features/guide/server/pipeline.ts`, `apps/web/src/features/guide/server/safety-net.ts`, `apps/web/src/features/guide/server/scrub.ts`

## Learning

**Seven-day mission road.** Seven missions on a road, each a short interactive lesson. A child can go on to the next mission whenever they like (#28, #63). `apps/web/src/app/(app)/child/learn`, `apps/web/src/features/learning/components/roadmap.tsx`, `packages/content/src/learning/missions`

**Interactive steps.** Choices, amounts, sliders that split money, sorting, matching, predictions and reasons, each graded at once with hints, a clear "Try again" and wrong steps coming back once at the end (#28). `apps/web/src/features/learning/components/mission-player.tsx`, `apps/web/src/features/learning/components/step-inputs.tsx`, `packages/core/src/learning/grade.ts`

**Blackboard and coach.** Each question sits on a blackboard with a coach beside it, who gives hints and feedback in a speech bubble, and fits on one screen (#71, #124). `apps/web/src/features/learning/components/blackboard.tsx`, `apps/web/src/features/learning/components/coach-bubble.tsx`

**Success dialog.** Right answers turn green with a clearer "Try again" for a wrong one. A success dialog with a closing ring, the amount and a Done button marks a child's new goal and a parent's money actions such as a gift, an allowance or a match (#119). `apps/web/src/components/celebrate/celebration-host.tsx`

**Lesson films.** The first lessons and the check-in open with a short animated film, narrated line by line with captions by a recorded voice (#122, #139). `apps/web/src/features/learning/components/lesson-film`, `packages/core/src/learning/film.ts`, `apps/web/public/lessons/voice`

**Read aloud.** Any lesson step can be read aloud in a calm device voice at a child-friendly pace (#110). `apps/web/src/features/learning/components/read-aloud-button.tsx`

**Check-in.** A short starting check-in with pictures places the child without marking anything right or wrong (#28, #122). `apps/web/src/app/(app)/child/learn/check-in`, `packages/content/src/learning/check-in.json`

**Topics and practice.** Five topic pages (What fits in Spend, Spend some, save some, Saving up for something, This or that? and When plans change) with explanations and a practice question, plus a short spaced practice set of review items in new situations (#28). `apps/web/src/app/(app)/child/learn/topics/[topicKey]`, `apps/web/src/app/(app)/child/learn/practice`, `packages/core/src/learning/skills.ts`

**Skill levels.** Each topic's skills have their own level, kept apart from money. `packages/core/src/learning/skills.ts`, `supabase/migrations/20261030100000_learning_progress.sql`

**Weekly review.** A card on the child's week that praises thinking and choices, names the week's one decision worth talking about and its effect on the goal, and ends with a question (#46). `apps/web/src/app/(app)/child/learn/week`, `apps/web/src/features/review`, `packages/core/src/review/build.ts`

**Comeback question.** After days away, the next step is one small, manageable task (#46). `packages/core/src/learning/comeback.ts`, `packages/core/src/learning/home-step.ts`

**Points and days in a row.** Points reward thinking and the run counts days with any learning. A run is never called lost: the copy only says what to start today (#109). `apps/web/src/features/learning/components/streak-badge.tsx`, `packages/core/src/learning/score.ts`

**My bests.** A board of one with the child's best mission and longest run, so there is no one to beat (#111). `apps/web/src/features/learning/components/personal-bests.tsx`

**Next step.** Home and Learn always show one next thing to do: resume, check in, practise, come back, the next mission or done (#57). `apps/web/src/features/learning/components/next-step-card.tsx`, `packages/core/src/learning/home-step.ts`

## Notifications

**Live inbox.** Notifications for both child and parent update live over Supabase Realtime, with an unread count on the nav and a toast for new arrivals (#37, #43). `apps/web/src/features/notifications/components/notice-listener.tsx`, `supabase/migrations/20261031044405_notifications_realtime.sql`

**What gets a notice.** Requests and their answers, spending over a limit, allowance days and handover reminders, card charges that did not go through, money received, diary fixes, jar moves, notes from a parent and Jarso noticed. `supabase/migrations/20261103130000_guide_noticed.sql`, `packages/core/src/notifications/copy.ts`

**Handover reminders.** On an allowance's due day the child and parents get a notice, and parents get a reminder every third day after while it waits (#37). `supabase/migrations/20261030164347_inbox_reminders.sql`

**Web push.** One switch per browser sends notices as browser notifications, and tapping one opens its record (#49). `apps/web/src/features/notifications/components/push-toggle.tsx`, `apps/web/public/sw.js`, `supabase/migrations/20261031080000_push_subscriptions.sql`

**Phone push.** Native push on Android through Expo and FCM, sent straight after an action and by a sweep every 15 minutes (#97, #101). `apps/web/src/features/notifications/server/expo-push.ts`, `apps/mobile/src/features/push`, `supabase/migrations/20261103220000_device_push_tokens.sql`

**Quiet hours.** A child's pushes wait between 9pm and 7am in the family's timezone and arrive in the morning (#97). `supabase/migrations/20261103220100_push_quiet_hours.sql`

**Per-phone notification settings.** Each phone has its own switches for requests and answers, allowance and money, learning and Jarso, and notes from family, plus Pause all. The inbox still gets every notice (#97, #101). `apps/mobile/src/features/push/notification-settings.tsx`, `supabase/migrations/20261103220300_device_push_prefs.sql`

**Invitation email.** A child's request to join reaches the parent by email with a link and a code (#10). `apps/web/src/features/notifications/server/email.ts`, `apps/web/src/features/family/server/service.ts`

## Payments

**Pay by card.** A parent can hand over an allowance or a gift by card through Stripe or Razorpay, in test mode, and the money lands in the child's jars once the payment succeeds (#56, #96). `apps/web/src/features/payments`, `apps/web/src/lib/payments`, `supabase/migrations/20261031064410_payments.sql`, `supabase/migrations/20261101095802_payments_multi_provider.sql`

**Provider logos.** Each payment option shows its provider's logo and name in a stacked choice (#131). `apps/web/src/features/payments/components/provider-logo.tsx`, `packages/core/src/payments/logos.ts`

**Saved cards.** Settings shows the saved card at each provider by brand and last four digits, with Remove, which also turns off every auto charge that uses it (#56). `apps/web/src/features/payments/components/saved-card-panel.tsx`

**Auto charge.** A parent can turn on auto charge for an allowance or a planned gift, which saves a card and charges it on the day, once. A charge that does not go through sends the parent a notice (#56). `apps/web/src/features/payments/components/auto-charge-toggle.tsx`, `apps/web/src/features/payments/server/auto-charge.ts`, `supabase/migrations/20261031071841_payments_auto_charge_cron.sql`

**Payment status.** The handover page shows a payment in progress, a returned or cancelled checkout and the result, and webhooks from each provider settle the payment (#56). `apps/web/src/features/payments/components/payment-status-note.tsx`, `apps/web/src/app/api/v1/payments/webhooks/[provider]/route.ts`

**Native payment sheet.** On the phone the parent pays in Stripe's PaymentSheet or Razorpay's native checkout (#96, #102). `apps/mobile/src/features/payments/sheets`, `apps/web/src/app/api/v1/payments/in-app/route.ts`, `supabase/migrations/20261103210000_payments_in_app.sql`

**Emergency money.** A child's request for extra money, once the parent says yes, is granted straight into Spend (#45). `supabase/migrations/20261031060000_emergency_funds.sql`, `apps/web/src/features/requests/components/ask-extra-sheet.tsx`

## Phone app (child)

**Sign in and remember me.** Family code, nickname and PIN, with an opt-in "Remember me on this phone" kept in the phone's secure keystore (#94). `apps/mobile/app/(auth)/sign-in.tsx`, `apps/mobile/src/features/auth/saved-sign-in.ts`

**Home.** Jarso with one line to say, a header with the child's streak, Sparks and the bell, up to two moment cards (a yes from a parent, pocket money due, an ask waiting), Spend and Save tiles, the goal card and today's mission (#145). `apps/mobile/app/(child)/(tabs)/index.tsx`, `apps/mobile/src/features/home`

**Money moves.** A raised gold + tab opens "What happened?": I bought something, I got money, Save some, Use savings and Ask for extra. Each is a big keypad with quick chips, then a picture grid, then a celebration with sound and haptics, with Undo where it applies; predict before deciding stays on Save moves (#94, #145). `apps/mobile/app/(child)/add.tsx`, `apps/mobile/src/features/flows`, `apps/mobile/app/(child)/purchase.tsx`, `apps/mobile/app/(child)/received.tsx`, `apps/mobile/app/(child)/take-out.tsx`, `apps/mobile/app/(child)/put-in.tsx`, `apps/mobile/app/(child)/ask-extra.tsx`

**Jar pages.** Each jar opens its own page with the balance, six weekly bars with the amount on each, one sentence about the week and the jar's two actions (#146). `apps/mobile/app/(child)/jar/[jar].tsx`, `apps/mobile/src/features/jars/jar-screen.tsx`, `apps/mobile/src/features/jars/weekly-bars.tsx`

**Goal.** A gold ring with the goal's emoji, four milestone stars (25, 50 and 75 per cent and "Got it!") that cheer once each, a "to go, about N weeks" line from the allowance pace, and a full celebration when the goal is reached; the goal sheet keeps its prediction step (#94, #146). `apps/mobile/app/(child)/goal.tsx`, `apps/mobile/src/features/goals/goal-ring.tsx`, `apps/mobile/src/features/goals/milestone-stars.tsx`

**Diary.** History, "Where your money went", undo, fixes and earlier versions of a line (#94). `apps/mobile/app/(child)/(tabs)/diary.tsx`, `apps/mobile/app/(child)/entry/[entryId].tsx`, `apps/mobile/src/features/diary`

**Learn.** A quest map of seven stops on a winding path, Jarso on today's stop and a chest at the end that shows a badge and a look. Questions use picture answer tiles and a Jarso hint bubble; a right answer gets a green sheet with a cheer, a wrong one a calm blue "Close! Try again", then "Here's how", never red. The check-in, topics, practice, the weekly review and "Help me" beside each step are all there (#94, #147). `apps/mobile/src/features/learning/quest-map.tsx`, `apps/mobile/src/features/learning/answer-sheet.tsx`, `apps/mobile/src/features/learning/picture-options.tsx`, `apps/mobile/app/(child)/learn`, `apps/mobile/src/features/learning`, `apps/mobile/src/features/learn/step-aside.tsx`

**Jarso chat.** Chats with Jarso, past chats, prepared action cards and thumbs up or down on a reply (#94). `apps/mobile/app/(child)/(tabs)/jarso.tsx`, `apps/mobile/app/(child)/jarso/[conversationId].tsx`, `apps/mobile/src/features/guide`

**Daily check-in.** "Spend anything today?" on Home's first open of the family's day: Yes opens "I bought something", Nope records the check-in (#147). `apps/mobile/app/(child)/checkin.tsx`, `apps/mobile/src/features/checkin`

**My asks.** Open and closed requests, with a three-step tracker for each open ask and cancel (#145). `apps/mobile/app/(child)/requests.tsx`, `apps/mobile/src/features/flows/ask-tracker.tsx`

**Notifications.** The bell on Home opens the live inbox; a card asks for push permission after the first ask, and taps on a push open its record (#101, #145). `apps/mobile/app/(child)/(tabs)/news.tsx`, `apps/mobile/src/features/push/push-permission-card.tsx`, `apps/mobile/src/features/push/use-push-taps.ts`

**Me.** A short menu with notifications, Jarso's memories, dark mode and sign out (#129). `apps/mobile/app/(child)/me.tsx`, `apps/mobile/src/features/settings/settings-screen.tsx`

**Kid look.** Jarso drawn as the mascot with moods in coach bubbles, on Home and through the lessons, big keycap buttons for the main action, and celebrations with confetti, sound and haptics (#141, #145). `apps/mobile/src/components/brand/jarso.tsx`, `apps/mobile/src/components/ui/button.tsx`, `packages/core/src/mascot`

## Phone app (parent)

**Family home.** Needs you, the next two weeks, the children list and the push permission card (#98). `apps/mobile/app/(parent)/(tabs)/index.tsx`, `apps/mobile/src/features/parent/family-home-screen.tsx`

**Child hub.** Each child's jars, allowance, money due, gifts, requests, learning, Jarso card, recent history and Send a note (#98). `apps/mobile/app/(parent)/children/[childId]/index.tsx`, `apps/mobile/src/features/parent/child-hub-screen.tsx`

**Handovers in cash or by card.** The handover splits money into Spend and Save, in cash or by card in the native payment sheet, for allowances and gifts (#98, #102, #112). `apps/mobile/app/(parent)/children/[childId]/handover/[kind]/[id].tsx`, `apps/mobile/src/features/payments`

**Allowances, gifts and rules.** Set, change and pause allowances, give or plan gifts, turn on auto charge and edit money rules (#98). `apps/mobile/app/(parent)/children/[childId]/allowance.tsx`, `apps/mobile/app/(parent)/children/[childId]/gifts`, `apps/mobile/app/(parent)/children/[childId]/rules.tsx`

**History and learning.** A child's full history and learning (#98). `apps/mobile/app/(parent)/children/[childId]/history.tsx`, `apps/mobile/app/(parent)/children/[childId]/learning.tsx`

**Jarso for parents.** The child's Jarso chats, memories and switch, and the parent's own Jarso chat (#98). `apps/mobile/app/(parent)/children/[childId]/guide`, `apps/mobile/app/(parent)/(tabs)/jarso.tsx`

**Setup and invitations.** Create the family and complete the profile, add a child and accept invitations on the phone (#98). `apps/mobile/app/(parent)/setup.tsx`, `apps/mobile/app/(parent)/children/new.tsx`, `apps/mobile/app/(parent)/invite.tsx`

**Settings.** A short menu with account details, the family timezone and code, each child (rename, PIN, Jarso switch, remove), saved cards, notifications and dark mode (#129). `apps/mobile/app/(parent)/settings`, `apps/mobile/src/features/parent/settings-screen.tsx`

## Platform

**Works offline.** Purchases and lesson answers queue on the device and send in order when the connection is back, with a banner that says the app is offline. The server records each action at the time it happened (#33). `apps/web/src/features/offline`, `packages/core/src/offline/outbox`, `apps/mobile/src/lib/outbox`, `apps/web/src/app/api/v1/outbox/route.ts`

**Install as an app.** The web app has a manifest and service worker, so it installs to a home screen and shows push notices (#49). `apps/web/src/app/manifest.ts`, `apps/web/public/sw.js`

**Light and dark.** A one-click switch on public pages, and Light, Dark or "Same as my phone" in Settings. The wordmark changes with the theme (#20, #26). `apps/web/src/components/theme`, `apps/mobile/src/features/settings/dark-mode-row.tsx`

**Sounds.** Short synthesised bell and wood tones: coins when money moves, a chime for a right answer, a soft bonk for a wrong one and a fanfare when a mission is done, with one switch in Settings (#80, #107). `apps/web/src/lib/sounds.ts`, `apps/web/src/components/sounds/sounds-toggle.tsx`

**Accessibility.** Every amount is in words as well as pictures, charts can be read by keyboard and in text, motion stops under reduced motion, tap targets meet size minimums, and titles on the phone stop growing at 1.3x so large system text still fits (#54, #125). `apps/web/src/features/landing/hooks/use-reduced-motion.ts`, `apps/mobile/src/lib/font-scale.ts`

**Child-first copy.** A text floor, plain words, calm error messages and money shown as cards and sentences, never tables or ledgers (#54, #55). `packages/core/src`, `docs/design.md`

**Landing page.** A scroll-driven landing page with a coded hero, the jar outline as one thread, playable "How it works" demos (a purchase, a goal, a handover, a mission and Jarso), structured data, a sitemap and share images (#34, #35, #63, #64, #66). `apps/web/src/app/(marketing)/page.tsx`, `apps/web/src/features/landing`, `apps/web/src/app/sitemap.ts`

**Privacy and safety pages.** Public pages explaining what data Jarso keeps and how Jarso the guide keeps children safe (#50). `apps/web/src/app/(marketing)/privacy`, `apps/web/src/app/(marketing)/safety`

**Health check.** `/api/health` answers for liveness, and `?deep=1` also checks the database for the uptime monitor (#50). `apps/web/src/app/api/health/route.ts`

## Behind the scenes

**pg_cron jobs.**
- `generate-due-occurrences` (hourly at :05) creates allowances as they fall due in each family's local date and resumes paused schedules whose pause has ended. `supabase/migrations/20261029130003_allowance_generation.sql`
- `send-handover-reminders` (hourly at :07) sends due-day notices and the every-third-day reminders. `supabase/migrations/20261030164347_inbox_reminders.sql`
- `charge-due-cards` (hourly at :09) runs auto charge through the app, with a daily Vercel cron on the same route. `supabase/migrations/20261031071841_payments_auto_charge_cron.sql`
- `push-sweep` (every 15 minutes) sends every notice still waiting for its push, including those held by quiet hours. `supabase/migrations/20261103220200_push_sweep_cron.sql`
- `blank-old-guide-text` (daily at 03:17) blanks Jarso chat text older than 30 days and forgets expired memories. `supabase/migrations/20261031070000_guide_memories.sql`
- Jarso noticed runs every Sunday evening on a Vercel cron. `apps/web/vercel.json`

**A money ledger.** Every movement is an append-only entry in integer minor units, balances are worked out from the entries, and every money write is a checked Postgres function. `supabase/migrations/20261029130001_ledger.sql`

**Progress engine.** Sparks, 10 levels from Jar Starter to Jar Legend, 23 badges and a forgiving streak, awarded by database triggers on diary lines, saves, lesson steps, finished missions and goal milestones, with daily caps. Sparks are never money and are never taken back. The engine also holds a daily money check-in and the child's Jarso look (a lid colour and outfits that unlock by level) (#143). `supabase/migrations/20261106120100_progress.sql`, `supabase/migrations/20261106120200_progress_awards.sql`, `packages/core/src/progress`

**Guide budgets.** Jarso has a daily budget (US$10 by default) and a monthly budget (US$100), rate limits per person per minute and per day, and a circuit breaker that serves calm fallback copy after repeated failures. The family summary is capped at 30 fresh summaries an hour per parent (#32). `apps/web/src/features/guide/server/budget.ts`, `apps/web/src/features/guide/server/breaker.ts`, `apps/web/src/features/guide/server/cost.ts`

**Retry-safe actions.** Gifts, handovers, notes, matches and Jarso's prepared actions each carry a one-time key, so a repeat after a lost response does the work once. `supabase/migrations/20261030130000_retry_safe_gift.sql`, `supabase/migrations/20261030130001_retry_safe_guide_turn.sql`

**Child passwords locked down.** A child's account never has a usable password: any password set on it is replaced with an unknown value, so the PIN is the only way in. `supabase/migrations/20261102200146_child_password_guard.sql`

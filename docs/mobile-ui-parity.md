# Phone UI parity with the web

A handoff for the phone app (`apps/mobile`), written 2026-11-05 after a web vs phone UI audit. The goal is that both apps *look* like one product: the same font, button style and small components. Each app keeps its own UX, screen structure and copy; nothing here asks for a screen to be laid out differently.

The rules themselves are in `docs/design.md` (§2 colour, §3 type, §4 shape, §6 components, §8 motion) and in the "Same look as the web" rule in `docs/mobile.md`.

## Already shared (no work)

- **Colours**, including the success greens, keycap ledges and tints, come from `@jarso/brand/tokens` through `apps/mobile/tailwind.config.js`; dark mode switches with the scheme.
- **Font**: Nunito, one family per weight, as on the web.
- **Type scale**: the phone column of design.md §3 (`mobileFontSize`).
- **Icons**: lucide on both.
- **Tab names and order** match the web's.
- **Lesson blackboard and gold hint boxes** match the web's.

## Shipped in #128

All in shared components, so every screen picked them up without layout changes.

| What | How to use it |
| --- | --- |
| Buttons are pills | Nothing to do: `Button` is `rounded-full` everywhere |
| Keycap buttons | `variant="keycap"` (teal), `"keycap-gold"` (Try again, money moments), `"keycap-success"` (Continue after a right answer). One keycap per screen, for the child's main action. Pressed, the 3 dp ledge goes and the face sinks without moving anything around it |
| Button loading state | `<Button loading={pending}>`: keeps its width, spinner in the label's colour, disabled and busy for screen readers. Use it instead of swapping the label for an `ActivityIndicator` |
| Fields | `Input` has the surface-2 (`bg-muted`) fill, 14 dp corners, no shadow, 48 dp tall |
| Cards | `Card` uses the web card's corners (`rounded-xl`, about 20 dp). Large cards and sheets (`p-5` / `p-6`) keep `rounded-2xl` (about 25 dp) |
| Spend jar | Teal fill (`bg-teal-600`), not cyan |
| Paid card note | `bg-success-soft` from the brand; the phone-only `tint-success` is gone, `tint-danger` stays |
| Mission player | Check is `keycap`, Continue is `keycap-success` after a right answer (`keycap` once the answer was shown), Try again is `keycap-gold`. The next-step card's button is `keycap` |

**Please check on an Android build:** the keycap press (it uses NativeWind `active:` height, margin and translate) and the spinner inside a loading button. Unit tests pass, but nobody has seen it on a phone yet.

## Still to do (bigger than a tweak)

Roughly in order of what a child notices most. Each row names the web piece to match and where it goes on the phone.

| # | Piece | Web source | Phone today | Notes |
| --- | --- | --- | --- | --- |
| 1 | **Coach and kid figures** | `apps/web/src/components/brand/coach-figure.tsx`, `kid-figure.tsx`, `coaches.ts` | `src/components/screen/coach-says.tsx` and `CoachBubble` in `src/features/learning/mission-player.tsx` show the coach's name and bubble, no drawing | Port the SVGs to `react-native-svg` (already a dependency) in a new `src/components/brand/`. Coach picked by the same stable key (`coachIdFor`). The cheer (two hops) and nod (one) after an answer are design.md §8; reanimated is installed. Reduced motion: no movement |
| 2 | **Success dialog** | `apps/web/src/components/celebrate/` (`celebrate()`, one host in the providers) | Big moments go through `flash()` (an Android toast): gift, allowance, handover, approvals, goal set | A centred card over a dimmed scrim (RN `Modal`): 96 dp success-soft badge with the icon, the amount in success-text, the title, one line, one full-width `keycap-success` "Done". Same moments as the web (design.md §6, "Success dialog"); small saves stay a toast. Reuse the web's copy objects from `@jarso/core` |
| 3 | **Lesson answer strip and green edge** | `ResultStrip` in `apps/web/src/features/learning/components/mission-player.tsx`; the card's `ring-success` | No strip; the card doesn't change after Check | One line above the buttons: "You got it! On to the next one." on `success-soft` with a check, "Not quite yet. One more try." on `tint-gold` with a retry icon. A right answer turns the step card's border green |
| 4 | **Jarso's eyes** | `apps/web/src/components/brand/jarso-eyes.tsx` | The "Jarso AI" chip (`src/features/guide/intro.tsx`) uses a bot icon; the empty chat has no face | The still eyes are enough; the 5 s blink is optional (design.md §8) |
| 5 | **Drawn jars** | `apps/web/src/components/brand/jar-art.tsx`, the web's jar shelf | `Half` in `src/features/jars/jars-card.tsx` draws a small box jar | Teal Spend, gold Save, filled to the share; keep the card's layout |
| 6 | **Status chip** | `apps/web/src/components/brand/status-chip.tsx` (design.md §2.5) | `CHIP` colour map inside `src/features/requests/request-list.tsx` | Icon plus word, never colour alone; one shared component |
| 7 | **Skeletons** | `apps/web/src/components/ui/skeleton.tsx` (shimmer) | About 40 files show an `ActivityIndicator` while loading | Surface-2 blocks shaped like the content, a shimmer band; start with Home, Diary and Learn |
| 8 | **Raised card** | `Card tone="raised"` on the web | `Card` has no raised option | Add a `raised` prop with a soft elevation, for each screen's main card |
| 9 | **More one-keycap screens** | Web's Spent something?, Send in Jarso | Plain primary buttons | Decide the one main action per screen first, then `variant="keycap"` |

## Ground rules for this work

- Change shared components first (`src/components/ui`, `screen`, a new `brand`) so screens pick things up for free; touch a screen only to swap a variant or drop in a component.
- Colours only through tokens (`bg-success-soft`, `border-keycap-ledge`…); no new hex values on the phone.
- Keep phone heights (48 / 56 dp) and the font-scale caps in `Text`.
- `tests/tailwind-colors.test.ts` fails on any colour class that doesn't resolve, which catches typos in token names.

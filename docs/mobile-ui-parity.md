# Phone UI parity with the web

How the phone app (`apps/mobile`) and the web look like one product: the same font, button style and small components. Each app keeps its own UX, screen structure and copy; nothing here asks for a screen to be laid out differently.

The rules themselves are in `docs/design.md` (§2 colour, §3 type, §4 shape, §6 components, §8 motion) and in the "Same look as the web" rule in `docs/mobile.md`.

## Already shared (no work)

- **Colours**, including the success greens, keycap ledges and tints, come from `@jarso/brand/tokens` through `apps/mobile/tailwind.config.js`; dark mode switches with the scheme.
- **Font**: Nunito, one family per weight, as on the web.
- **Type scale**: the phone column of design.md §3 (`mobileFontSize`).
- **Icons**: lucide on both.
- **Tab names and order** match the web's.
- **Lesson blackboard and gold hint boxes** match the web's.

## Shared components (#128)

All in shared components, so every screen picked them up without layout changes.

| What | How to use it |
| --- | --- |
| Buttons are pills | Nothing to do: `Button` is `rounded-full` everywhere |
| Keycap buttons | `variant="keycap"` (teal), `"keycap-gold"` (Try again, money moments), `"keycap-success"` (Continue after a right answer). One keycap per screen, for the child's main action. Pressed, the 5 dp ledge goes and the face sinks without moving anything around it |
| Button loading state | `<Button loading={pending}>`: keeps its width, spinner in the label's colour, disabled and busy for screen readers. Use it instead of swapping the label for an `ActivityIndicator` |
| Fields | `Input` has the surface-2 (`bg-muted`) fill, 14 dp corners, no shadow, 48 dp tall |
| Cards | `Card` uses the web card's corners (`rounded-xl`, about 20 dp). Large cards and sheets (`p-5` / `p-6`) keep `rounded-2xl` (about 25 dp) |
| Spend jar | Teal fill (`bg-teal-600`), not cyan |
| Paid card note | `bg-success-soft` from the brand; the phone-only `tint-success` is gone, `tint-danger` stays |
| Mission player | Check is `keycap`, Continue is `keycap-success` after a right answer (`keycap` once the answer was shown), Try again is `keycap-gold`. The next-step card's button is `keycap` |

## Kid UI (2026-11-06)

The kid-UI rework's foundation brings the web's characters and big moments to the phone: Jarso the mascot (whole face and eyes, replacing the four coaches), `CoachSays` with a speech bubble, `useCelebrate()` for full-screen or sheet celebrations with sound and haptics, and the `keycap-grape` and `keycap-white` buttons. Spec: `docs/superpowers/specs/2026-11-06-mobile-kid-rework-design.md`.

## Ground rules for this work

- Change shared components first (`src/components/ui`, `screen`, a new `brand`) so screens pick things up for free; touch a screen only to swap a variant or drop in a component.
- Colours only through tokens (`bg-success-soft`, `border-keycap-ledge`…); no new hex values on the phone.
- Keep phone heights (48 / 56 dp) and the font-scale caps in `Text`.
- `tests/tailwind-colors.test.ts` fails on any colour class that doesn't resolve, which catches typos in token names.

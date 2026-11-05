# Mobile parent Settings: a menu instead of one long scroll

Date: 2026-11-05 · Scope: `apps/mobile` only · Mockup: `docs/superpowers/specs/mockups/2026-11-05-mobile-settings-menu.html` (option A, v6)

## Why

The parent Settings screen (`apps/mobile/src/features/parent/settings-screen.tsx`) is one long
column of nine cards: family code, Family (timezone form + accept invitation), Children (every
child with Rename / Reset PIN / Remove and the Jarso switch), Your account (name form), Your
details (form), saved cards slot, Notifications, Looks, Sign out. The parent has to scroll past
all the forms to reach Notifications, Looks or Sign out. Goal: every option reachable from one
screen without scrolling; forms move onto their own pages.

## Goals

- The Settings screen is a short, grouped menu that fits one phone screen at the default text size.
- Each form lives on its own pushed page with the native back button (like the existing pages in
  `app/(parent)/_layout.tsx` `PAGES`).
- The theme control becomes a single **Dark mode** switch (light or dark). The "Same as my phone"
  option is removed.

## Non-goals

- No change to what any setting does, its validation, server calls, copy for forms, or the web app.
- No new settings.

## Anti-goals

- Removing a child must not get easier to tap by mistake (it stays apart and keeps its confirm dialog).
- Settings must still open before setup is done (so a parent without a family can sign out).

## The Settings screen (decided, see mockup screens 1 and 2)

Top to bottom:

1. **Family code**: a single compact card with the label "Family code", the code, the line "Your child signs in with it"
   and a **Share** button on the right. Same share behaviour as today's `FamilyCode`.
2. **Children** group: one row per child (avatar initial, nickname, subtitle "Jarso on" / "Jarso
   off" when the guide is set up, otherwise no subtitle), chevron → the child's settings page. Then
   an **Add a child** row → existing `/(parent)/children/new`. If there are no children, only the Add
   row (plus today's "no children" text is optional).
3. **Family** group: **Timezone** row (subtitle: current timezone) → timezone page; **Accept a
   child's invitation** row → existing `/(parent)/invite`.
4. **You** group: **Your account** row (subtitle: the parent's name) → account page;
   **Notifications** row → existing `/(parent)/notifications` (no subtitle: the mockup's "On" is
   dropped, since push state has several states and summarising it is new work; my call); **Dark mode** row with a switch
   (no chevron, no page).
5. **Sign out**: outline button at the bottom, no card around it.

Group labels are small uppercase muted text above each group. Rows inside a group share one card
with hairline separators. Row subtitles show the current value.

Before setup (no family yet): only the You group and Sign out show, as today.

`SavedCardsSlot` (renders nothing until card payments land) moves into the You group as a row slot
or stays rendered below the groups; builder's call, as long as it still renders nothing today.

## The pages (decided, see mockup screens 3–5)

- **A child's settings page** (mockup screen 3): header title = nickname. Content sits together
  at the top with no large gaps:
  1. A header card: avatar initial, nickname, and the muted line "Signs in with family code
     <CODE>, nickname and PIN".
  2. A **Sign-in** group: **Rename** (subtitle "Nickname: <name>") and **Reset PIN** (subtitle
     "Set a new PIN (4 to 6 numbers)"), each with a chevron. They open today's rename and PIN
     forms (in place or as their own pages; builder's call).
  3. A **Jarso** group with today's `GuideSwitch` row (only when the guide is set up; hide the
     group label too when it isn't).
  4. **Remove**: a red-outlined button "Remove <name> from your family" pinned to the bottom of the
     screen (above the bottom safe area), apart from everything else. It opens today's remove
     confirm dialog; on success, go back to Settings. The empty space between the Jarso group and
     this button is intended (user asked for the button at the bottom).
  Route must not collide with the existing child hub `app/(parent)/children/[childId]/index.tsx`.
- **Timezone page**: today's timezone field, help text and Save; the currency sentence
  (`familySettingsCopy.familyBody`) below as small muted print.
- **Your account page**: today's name form card, then the "Your details" card with
  `ParentDetailsForm` (only when details exist, as today). Uses the keyboard-aware scroll view.
- Notifications: unchanged existing page.

New pages are added to the parent stack's `PAGES` list with titles, so they get the native header
and back button. Before setup, only the account page is added to the `OPEN_BEFORE_SETUP`
allowlist (timezone and child pages need a family). Notifications keeps today's behaviour
(redirects to setup before setup is done); my call, unchanged from today.

## The child's "Me" screen (decided, mockup `mockups/2026-11-05-mobile-child-me.html`)

`apps/mobile/src/features/settings/settings-screen.tsx` (route `app/(child)/me.tsx`) gets the same
menu style, with the child's slightly larger text (row labels as today's child h3 scale):

1. Title "Me" (today's `ScreenHeader`).
2. A header card: avatar initial, nickname, and today's line ("You sign in as <nickname>. A parent
   can change your nickname or PIN.").
3. One group: **Notifications** row → existing `/(child)/notifications`; **Dark mode** switch row;
   **What Jarso remembers** row (subtitle: "<n> notes", or "1 note") → a new page with today's
   `MemoryList` (intro, rows, Forget with confirm). The row shows only when `MemoryList` shows today
   (guide on, or any memory exists).
4. Pinned to the bottom of the screen: the line "You can sign back in with your family code,
   nickname and PIN." and the Sign out button, with today's offline warning flow unchanged (first
   tap shows the waiting line, the button becomes "Sign out anyway").

The new memories page is added to the child stack with the title "What Jarso remembers" and the
native back button.

## Dark mode switch (decided)

- One switch, label **Dark mode**, on both the parent Settings screen (You group) and the child's
  "Me" screen (replacing the Looks card there). The "Looks" title/radio group goes away.
- On = dark, off = light. Stored on the device as today (SecureStore key `theme`).
- Starting value when nothing usable is stored (first launch, or an old stored `"system"`): the
  phone's current scheme at that moment, **written to storage at once**, so it stays fixed across
  launches until the user flips the switch. (My call; the user didn't object.)
  `userInterfaceStyle: "automatic"` in `app.json` stays: it only decides the splash and the first
  frame before the stored value loads.
- `ThemeChoice` drops `"system"`; `colorScheme.set` only ever receives `"light"` or `"dark"`.
- The status bar fix from earlier today (root layout mounts `StatusBar` after the splash) must keep
  working with the switch.

## Constraints

- Follow `CLAUDE.md` hard rules and `docs/mobile.md`: barrels, no deep imports across features,
  copy in `@jarso/core` where shared copy already lives (new strings like "Dark mode", "Your child
  signs in with it", group labels go in the relevant core copy objects).
- Touch targets ≥ 48 dp, accessible labels and roles (switch rows use `accessibilityRole="switch"`).
- Light and dark themes both use semantic tokens only.
- Existing tests in `apps/mobile/tests/features/parent/settings.test.tsx`,
  `tests/features/settings/settings-screen.test.tsx`, `tests/app/parent-layout.test.tsx` will need
  updating; add tests for the new pages and the switch. `pnpm check` must pass.

## Prerequisite

The status bar fix (root `_layout.tsx` mounts `StatusBar` after the splash fades) is uncommitted
in the main working tree. It ships together with this Settings work (user's call), as its own
commit in the same branch.

## Left to the builder

- File and route names (e.g. a `settings/` route folder).
- Whether Rename / Reset PIN are in-place or separate pages.
- Where `SavedCardsSlot` sits.
- Reusing/extending `ListRow` vs a small new grouped-row component.

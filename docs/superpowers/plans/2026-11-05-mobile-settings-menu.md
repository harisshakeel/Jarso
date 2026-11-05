# Mobile Settings menu: implementation plan

Spec: `docs/superpowers/specs/2026-11-05-mobile-settings-menu-design.md` (mockup option A, v6).
Scope: `apps/mobile` and new copy lines in `packages/core`. No commits from this plan.

**Goal:** the parent Settings screen becomes a short grouped menu; its forms move to pushed
pages; the theme control becomes one Dark mode switch (parent Settings and child Me).

## Decisions left to the builder

- Routes: `app/(parent)/settings.tsx` becomes `settings/index.tsx`; new pages
  `settings/timezone.tsx`, `settings/account.tsx`, `settings/children/[childId].tsx` (no clash with
  the child hub at `children/[childId]/index`). Only `/settings/account` joins `OPEN_BEFORE_SETUP`.
- Rename and Reset PIN open in place under their row on the child page (today's forms, rows report
  `expanded`); Remove sits at the end of a `grow` scroll content with `mt-auto`, so it is at the
  bottom of the screen and moves down when a form opens.
- `ListRow` gains `leading`, `labelClassName` and `expanded`; a new `ListGroup` (components/screen)
  draws the group label (a muted `Eyebrow`, sentence case: the spec asked for uppercase, but
  `tests/type-scale.test.ts` and design.md §3 ban all-caps labels on the phone) and one card with
  hairlines.
- `SavedCardsSlot` stays its own card below the groups (renders nothing today).
- Dark mode row: the whole 48 dp row is the switch (`accessibilityRole="switch"`, `checked`), the
  visual `Switch` inside is hidden from screen readers. Its value is NativeWind's current scheme.
- Theme start: a stored `light`/`dark` wins; nothing or an old `system` resolves to
  `Appearance.getColorScheme()` and is saved at once. A failed read uses the phone's scheme and
  does not write (it may hide a real stored value).

## Tasks

1. **Core copy** (`packages/core`): `profileCopy.darkMode`, `darkModeBody`, `youGroup`
   (replacing `looksTitle`/`looksBody`); `familySettingsCopy.codeShort`, `signInGroup`,
   `childSignsIn(code)`, `nicknameIs(name)`, `pinRowBody`, `removeFromFamily(name)`;
   `parentGuideCopy.settingsGroup`, `childState(on)`. Update snapshots.
2. **Theme** (TDD): tests for `loadTheme` (stored wins, missing/`system` → phone scheme and saved,
   read failure → phone scheme, no write), `DarkModeRow` (reflects scheme, flips, stores). Then
   `theme.ts` drops `system`; `dark-mode-row.tsx` replaces `theme-section.tsx`; child Me uses it.
3. **List pieces**: `ListRow` props, `ListGroup`; test in `tests/components/screen.test.tsx`.
4. **Parent Settings menu** (TDD): rewrite `tests/features/parent/settings.test.tsx` for the menu
   (code + Share, child rows with Jarso state, rows navigate, Dark mode, Sign out, before setup).
   Then `settings-screen.tsx`; `FamilyCode` becomes the compact card (its only user is Settings).
5. **Pages** (TDD): `tests/features/parent/settings-pages.test.tsx` for the child page (header,
   rename taken, PIN, remove fail keeps dialog, remove success goes back, Jarso group hidden when
   not set up), timezone page and account page. Then `child-settings-screen.tsx`,
   `timezone-screen.tsx`, `account-screen.tsx`, `single-field-form.tsx`, forms moved to
   `child-settings-forms.tsx`.
6. **Routes and layout**: new route files, `PAGES` entries, `OPEN_BEFORE_SETUP`; layout test for
   the account page before setup and the timezone page redirecting to setup.
7. **Child Me** (scope added after approval): `settings-screen.tsx` gets `ScreenHeader` "Me", a
   header card (initial, nickname, today's sign-in line), one group (Notifications →
   `/(child)/notifications`, Dark mode without its detail line, What Jarso remembers with
   `guideCopy.memories.count(n)` → new `app/(child)/memories.tsx` holding `MemoryList`), and the
   sign-back-in line plus Sign out at the bottom (`grow` + `mt-auto`), offline warning unchanged.
   Row labels at h3. `useOwnMemories()` (guide) shares the show rule with `MemoryList`.
   `RowIcon` and `InitialAvatar` move to `components/screen`; the now unused `NotificationsRow`
   goes. Tests in `tests/features/settings/settings-screen.test.tsx`.
8. **Docs**: `docs/mobile.md` layout line and setup-gate line.
9. **Verify**: `pnpm --filter @jarso/mobile lint typecheck test`, core tests, `pnpm check`.

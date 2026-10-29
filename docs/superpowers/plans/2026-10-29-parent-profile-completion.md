# Plan: parent profile completion (feature 2)

> Implemented in `feat/parent-profile-completion` (ADR 0008). Changed during build, following review: the details live in a separate owner-only `parent_details` table instead of new `profiles` columns, the function is the only write path, and the server-side block covers every parent action through `assertRole("parent")`, not only money actions.

Decided with the product owner on 2026-10-29, to be built on its own branch after `feat/family-settings-unlink` merges.

## Decisions

- **Who:** parents only. Children stay nickname-only (FR13 data minimisation, ADR 0004).
- **Fields:** date of birth, country, gender. No address, no phone.
- **Gating:** from the first sign-in after sign-up, a modal on every parent page asks the parent to complete the profile and disables the main features until done. Settings, sign-out and the profile form itself stay reachable. Children are never gated. Slice 4's deposits and withdrawals, and later money actions, refuse to start for a family whose parent profile is incomplete (`profile_completed_at is null`).
- **Why these fields:** date of birth confirms the account holder is an adult (consent, D7); country feeds pilot-country reporting and the open parental-verification decision; gender is a product-owner request for the pilot evaluation. Each is optional to *answer* only where a "prefer not to say" option exists (gender); date of birth and country are required.

## Data

Migration `parent_profile_details`:

- `profiles.date_of_birth date`, `profiles.country text check (country ~ '^[A-Z]{2}$')` (ISO 3166-1 alpha-2), `profiles.gender text check (gender in ('female','male','non_binary','prefer_not_to_say'))`, `profiles.profile_completed_at timestamptz`.
- Column grant for `authenticated` on the three detail columns only (not `profile_completed_at`, not `role`, not `nickname`), under the existing "Parents can update their own profile" policy.
- Function `complete_parent_profile(p_date_of_birth date, p_country text, p_gender text)`: caller must be a parent; date of birth at least 18 years before today and not before 1900; country must be a known code (seeded `countries` lookup or app-side list mirrored in a check); sets the three columns and `profile_completed_at = now()`; audit `profile.completed`. Re-running updates the details and keeps the original completion time.
- Function `parent_profile_complete(p_family_id uuid) returns boolean` for later money functions to call, and the same check in the app's `assertProfileComplete()` DAL helper.
- RLS: only the owner can read their own detail columns; other family members' selects use a view or column-level grants so a child can never read a parent's date of birth. Simplest: keep `profiles` select policy as is, and put the three columns behind column-level `select` grants to `authenticated` revoked, with a `security definer` `my_profile_details()` for the owner. Decide at implementation after checking PostgREST column-grant behaviour.

## App

- `features/profiles`: `completeParentProfileSchema` (dob as ISO date string, country enum from a list in `config`, gender enum), `completeParentProfileAction`, service `completeParentProfile`, repository rpc; `getProfileCompletion()` for the gate.
- `ProfileCompletionGate` client component rendered in the parent layout behind Suspense: when incomplete, a non-dismissible dialog with the form (date input with `inputMode` numeric and a native date picker, country select, gender select with "Prefer not to say"); behind it the page is inert (`inert` attribute on main) so "the main features are disabled". Allowed through: `/parent/settings`, sign-out.
- Parent home gets a "Finish your profile" card as well, for the case where the dialog is closed by navigation.
- `assertProfileComplete()` in the family DAL, called by money actions from slice 4 on; returns FORBIDDEN with copy "Finish your profile first".
- Settings page shows the details with an edit form (reuses the same action).

## Tests

- pgTAP: adult check, country check, gender enum, completion timestamp set once, child cannot call, other users cannot read the detail columns.
- Unit: schema (date parsing, 18+ rule, codes), service, gate component (renders dialog when incomplete, nothing when complete).
- e2e: sign up → dialog shown and main content inert → complete → dialog gone → settings shows details; child sign-in never shows it.

## Docs

- REQUIREMENTS.md FR13: add the parent-profile bullet and the gating rule; note children remain nickname-only.
- docs/security.md: date of birth and country are personal data of adults; never logged; shown only to the owner.
- docs/architecture.md: profiles columns, functions, gate in the flow; ADR 0008 "Parent profile completion gates money actions".

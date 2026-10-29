# 0008. Parents complete a private profile before using the app

- Status: Accepted
- Date: 2026-10-29

## Context

The product owner wants each parent's date of birth, country and gender before the main features are used: date of birth confirms the account holder is an adult (consent, decision D7), country supports pilot-country reporting and the open parental-verification question, and gender feeds the pilot evaluation. Children stay nickname-only (FR13). `profiles` rows are readable by the whole family, children included, so the details cannot live there without column-level privilege tricks that break `select *`.

## Decision

A separate `parent_details` table (one row per parent, owner-only select policy, no direct writes) holds date of birth, ISO 3166-1 alpha-2 country, gender (`female`, `male`, `non_binary`, `prefer_not_to_say`) and the first completion time. `complete_parent_profile()` is the only write path; it checks the caller is a parent, 18 or over, a two-letter code and a known gender, and upserts while keeping the first completion time. The app validates the country against the assigned list.

Until the row exists, every parent page shows a dialog that cannot be dismissed (sign-out is the only other way out), and the app server refuses parent actions: `assertRole("parent")`, which every family action goes through, throws "Finish your profile first.". Reads are not gated: the pages render behind the dialog, so parent reads check role and parenthood with `assertParentCanRead` (or `assertSelfOrParentOf`) rather than `assertParentOf`, and a parent whose account predates this change never hits an error page. Deliberate exceptions, all limited to the parent's own account: completing the profile, signing out, and editing their own display name (`updateProfileAction`, `PATCH /api/v1/me`).

The database does not enforce completion: neither the family functions (`create_family`, `rename_child`, `remove_child`, `update_family_timezone`, `set_child_pin`) nor the slice 2 money functions (allowance schedules, gifts, handover, not given) check `parent_details`. A parent calling them directly through the Supabase API with their own session could skip the app check. The impact is small, since the parent is already authorised for those actions and every database function still checks that the caller is a parent of the child. The app gate is the enforcement.

Amended 2026-10-29: this ADR first said the money functions would check `parent_details` in the database. Slice 2 shipped without it, and the slice 2 review chose to record the app gate as the enforcement rather than add the check to ten functions. Revisit if a parent's profile ever becomes a legal precondition for recording money (for example, age verification as part of parental consent).

## Consequences

- Children and other parents can never read a parent's details; only the owner sees them, in settings.
- Every existing parent account sees the dialog once after this ships.
- Adds personal data about adults: never logged, never in audit details, shown only to the owner.
- The full date of birth is kept (product decision, 2026-10-29), although only the 18+ result is used today. Details are deleted only with the account. The privacy notice must say what is collected and why before the pilot opens to real families.
- End-to-end tests complete the profile after every parent sign-up (`completeParentProfile` helper).

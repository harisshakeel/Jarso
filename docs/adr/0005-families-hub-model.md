# 0005. Families as a hub table with many parents and many children

- Status: Accepted
- Date: 2026-10-28

## Context

The pilot allows one parent and one child, but two parents, siblings and a second guardian are ordinary family shapes. A `parent_id` on the child row would force a migration and an RLS rewrite the first time any of them appears.

## Decision

`families` is the hub: it owns the family code and currency. `family_members` links profiles to a family with a role and an approval status. Every money table carries `family_id` and `child_id`. RLS predicates are `is_approved_member(family_id)`, `is_parent_of(child_id)` and `is_self(child_id)`.

## Consequences

- Adding a second parent or child is data, not schema.
- Family isolation is a single predicate reused by every policy, easy to test with two families.
- Slightly more joins than a parent-id column; irrelevant at pilot scale.

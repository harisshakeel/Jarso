# 0007. Removing a child deletes the identity while there is no money history

- Status: Accepted
- Date: 2026-10-29

## Context

A parent must be able to unlink a child (wrong nickname, a child who leaves the household, a test account). The child's identity is a real auth user (ADR 0004) with a PIN, and children's data should be kept no longer than needed. Once the ledger exists, a child's money history belongs to the family and must survive.

## Decision

`remove_child` (parent only, audited) marks the membership `removed`, frees the nickname, deletes the PIN credentials and attempt counters, and returns whether the identity may be deleted. The app then revokes every session and, when allowed, deletes the auth user, which cascades the profile and the membership row. The function returns `true` today; later slices return `false` once ledger rows reference the child, so the identity is kept, disabled. A removed child cannot sign in, is invisible to the parent, and their nickname can be given to a new child.

## Consequences

- Data minimisation by default: no orphaned child identities while the account held nothing.
- Irreversible: there is no undo window. The dialog says so; a parent re-adds the child with a new PIN.
- The money slices must make `remove_child` return `false` when history exists and must never cascade-delete ledger rows from `profiles`.
- A failed auth-user delete leaves a disabled account, never a usable one, because the database disables first.

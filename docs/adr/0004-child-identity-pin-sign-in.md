# 0004. Child identity: parent-created account with family code, nickname and PIN

- Status: Accepted
- Date: 2026-10-28

## Context

Children aged 11–14 must not be asked for an email address (FR13, data minimisation), yet each child needs their own identity so Row Level Security can separate parent and child and the child can use their own device. Email magic links and passwords both assume an inbox.

## Decision

A parent creates the child account. The server mints a real Supabase Auth user with a synthetic non-deliverable email and an unguessable password the child never sees. The child signs in with the family code, their nickname and a PIN set by the parent. A `security definer` function verifies the bcrypt PIN hash with attempt counting and lockout; on success the server creates a session via `generateLink` + `verifyOtp`. Parents reset PINs.

## Consequences

- No child email is collected; RLS works per child; the child can sign in on any device.
- The PIN is low entropy, so lockout, rate limiting and parent-only reset are mandatory, not optional.
- Child accounts cannot use email-based recovery; the parent is the recovery path.
- Child-initiated onboarding becomes an invitation to the parent, who completes account creation.

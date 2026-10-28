# 0006. Notifications are derived records with inbox, email and push channels

- Status: Accepted
- Date: 2026-10-28

## Context

FR16 requires that every essential action works without push and that failed delivery never loses a request or reverses a completed action. Parents rarely open a child's money app daily, so reminders need a channel that reaches them.

## Decision

Record-changing Postgres functions insert `notifications` in the same transaction, plus `notification_deliveries` rows per channel. The inbox is the notifications table itself. A dispatcher, triggered by a database webhook and swept by pg_cron, sends email (parent actions only, batched hourly) and later web push, with retries, backoff and a dead state. Channels are adapters; the provider (Resend first) is swappable.

## Consequences

- A notification exists if and only if its record change committed.
- Delivery problems are visible in one table and never touch records.
- Email adds a provider and a secret; batching avoids spamming parents.

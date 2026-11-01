import { z } from "zod";

/** `null` marks every unread notice as read. */
export const markReadSchema = z.object({ ids: z.array(z.uuid()).max(100).nullable() });

const KEY = z.string().min(1).max(200);

/** `PushSubscription.toJSON()` from the browser; extra fields (`expirationTime`) are ignored. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({ p256dh: KEY, auth: KEY }),
});

export const pushEndpointSchema = z.object({ endpoint: z.url({ protocol: /^https$/ }).max(2000) });

const CURSOR = /^\d{4}-\d{2}-\d{2}[T ][0-9:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?\|[0-9a-f-]{36}$/i;

/** `?before=` on the inbox page: a `<created_at>|<id>` cursor; anything unusable means the newest page. */
export const inboxParamsSchema = z.object({
  before: z
    .preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().regex(CURSOR).optional())
    .catch(undefined),
});

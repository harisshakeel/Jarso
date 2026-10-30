import { z } from "zod";

/** `null` marks every unread notice as read. */
export const markReadSchema = z.object({ ids: z.array(z.uuid()).max(100).nullable() });

const CURSOR = /^\d{4}-\d{2}-\d{2}[T ][0-9:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?\|[0-9a-f-]{36}$/i;

/** `?before=` on the inbox page: a `<created_at>|<id>` cursor; anything unusable means the newest page. */
export const inboxParamsSchema = z.object({
  before: z
    .preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().regex(CURSOR).optional())
    .catch(undefined),
});

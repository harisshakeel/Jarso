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

/** An Expo push token, as `getExpoPushTokenAsync` gives it (and as the table checks). */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

/** `POST /api/v1/push/tokens`: this phone's Expo push token (Android, through FCM). */
export const devicePushTokenSchema = z.object({
  token: z.string().regex(EXPO_PUSH_TOKEN),
  platform: z.literal("android"),
});

/** `DELETE /api/v1/push/tokens`. */
export const devicePushTokenDeleteSchema = z.object({ token: z.string().regex(EXPO_PUSH_TOKEN) });

/** Notice groups a phone can mute, as the `device_push_tokens.muted_groups` check allows. */
export const NOTICE_GROUPS = ["requests", "money", "learning", "notes"] as const;

/** A phone's push settings, sent with its own token (only the owner's row changes). */
export const devicePushPrefsSchema = z.object({
  token: z.string().regex(EXPO_PUSH_TOKEN),
  mutedGroups: z.array(z.enum(NOTICE_GROUPS)).max(NOTICE_GROUPS.length),
  paused: z.boolean(),
});

/** A `NoticeTarget` read back from a push payload on the phone. */
export const noticeTargetSchema = z.discriminatedUnion("to", [
  z.object({
    to: z.literal("handover"),
    childId: z.uuid(),
    kind: z.enum(["allowance", "gift"]),
    id: z.uuid(),
  }),
  z.object({ to: z.literal("child"), childId: z.uuid() }),
  z.object({ to: z.literal("child-history"), childId: z.uuid() }),
  z.object({ to: z.literal("diary") }),
  z.object({ to: z.literal("goal") }),
  z.object({ to: z.literal("jarso") }),
  z.object({ to: z.literal("home") }),
]);

/** The `data` of a phone push (`PushData`), parsed before the app navigates on a tap. */
export const pushDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("notice"),
    noticeId: z.uuid(),
    recipientId: z.uuid(),
    role: z.enum(["parent", "child"]),
    target: noticeTargetSchema,
  }),
  z.object({
    kind: z.literal("summary"),
    recipientId: z.uuid(),
    role: z.literal("child"),
    count: z.int().min(2),
  }),
]);

const CURSOR = /^\d{4}-\d{2}-\d{2}[T ][0-9:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?\|[0-9a-f-]{36}$/i;

/** `?before=` on the inbox page: a `<created_at>|<id>` cursor; anything unusable means the newest page. */
export const inboxParamsSchema = z.object({
  before: z
    .preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().regex(CURSOR).optional())
    .catch(undefined),
});

/** Longest note a parent can send their child, as the database function also checks. */
export const NOTE_MAX = 140;

/** A parent's note to their child (parent dashboard). Lands in the child's Notifications. */
export const childNoteSchema = z.object({
  childId: z.uuid(),
  text: z
    .string({ error: "Write a note first." })
    .trim()
    .min(1, "Write a note first.")
    .max(NOTE_MAX, `Keep it to ${NOTE_MAX} characters.`),
  /** One per sheet open, so a re-send after a lost response sends one note. */
  idempotencyKey: z.uuid("Please reload the page and try again."),
});
export type ChildNoteInput = z.infer<typeof childNoteSchema>;

/** What sending a note did: `already_sent` for a repeat of the same key. */
export type NoteResult = "sent" | "already_sent";

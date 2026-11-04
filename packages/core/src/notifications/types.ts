export type EmailMessage = { to: string; subject: string; text: string };
export type EmailResult = "sent" | "skipped";

export type NoticeKind =
  | "limit_exceeded"
  | "withdrawal_requested"
  | "withdrawal_decided"
  | "deposit_requested"
  | "deposit_decided"
  | "emergency_requested"
  | "emergency_decided"
  | "allowance_due"
  | "handover_reminder"
  | "card_charge_failed"
  | "money_received"
  | "entry_corrected"
  | "jar_moved"
  | "guide_noticed"
  | "parent_note";

/**
 * `guide_noticed`: a weekly "Jarso noticed" nudge. `note`: a parent's note to their child;
 * `sourceId` is the parent who wrote it.
 */
export type NoticeSource =
  | "ledger_entry"
  | "request"
  | "allowance_occurrence"
  | "payment"
  | "guide_noticed"
  | "note";

export type Notice = {
  id: string;
  kind: NoticeKind;
  childId: string;
  childName: string;
  sourceType: NoticeSource;
  sourceId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  read: boolean;
};

export type NoticePage = { items: Notice[]; nextBefore: string | null };

/** What `PushSubscription.toJSON()` gives the server (FR16). */
export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** One stored browser subscription, as the dispatcher reads it. */
export type PushSubscriptionRow = {
  id: string;
  profileId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** A notice the dispatcher has claimed, with what its push text needs. */
export type ClaimedNotice = {
  recipientId: string;
  role: "parent" | "child";
  currency: string;
  /**
   * A child notice written during the family's night (21:00-07:00). Child notices are held until
   * 07:00; two or more overnight ones for one child go as a single summary push.
   */
  overnight: boolean;
  notice: Notice;
};

/** What a push run did. `summarised`: notices covered by a summary push (also in `claimed`). */
export type PushResult = {
  claimed: number;
  sent: number;
  dropped: number;
  failed: number;
  summarised: number;
};

/** What the phone posts to register for push (`POST /api/v1/push/tokens`). */
export type DevicePushTokenInput = { token: string; platform: "android" };

/** Groups of notices a phone can mute (per-phone settings). Every `NoticeKind` is in one. */
export type PushGroup = "requests" | "money" | "learning" | "notes";

/** A phone's own push settings: muted groups, or everything paused. The inbox is unchanged. */
export type DevicePushPrefs = { mutedGroups: PushGroup[]; paused: boolean };

/** One stored phone push token with its settings, as the dispatcher reads it. */
export type DeviceTokenRow = {
  id: string;
  profileId: string;
  token: string;
  mutedGroups: PushGroup[];
  paused: boolean;
};

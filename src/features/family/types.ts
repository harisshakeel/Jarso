export type Membership = { familyId: string; role: "parent" | "child"; status: "approved" };
export type Family = { id: string; code: string; currency: string; timezone: string };
/** After a demo clock move: how far ahead the family now is, its new today, and what ran. */
export type ClockAdvance = {
  offsetDays: number;
  today: string;
  generated: number;
  reminders: number;
};
export type ChildSummary = { id: string; nickname: string };
/** A child-started invitation addressed to the signed-in parent's email. Timestamps are ISO. */
export type PendingInvitation = {
  id: string;
  nickname: string;
  createdAt: string;
  expiresAt: string;
};

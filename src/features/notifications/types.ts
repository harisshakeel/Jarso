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
  | "handover_reminder";

export type NoticeSource = "ledger_entry" | "request" | "allowance_occurrence";

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

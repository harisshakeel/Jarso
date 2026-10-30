export type EmailMessage = { to: string; subject: string; text: string };
export type EmailResult = "sent" | "skipped";

export type NoticeKind =
  | "limit_exceeded"
  | "withdrawal_requested"
  | "withdrawal_decided"
  | "deposit_requested"
  | "deposit_decided";

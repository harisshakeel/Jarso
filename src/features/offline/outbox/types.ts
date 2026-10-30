export type OutboxKind = "purchase" | "practice" | "step" | "completeMission" | "checkIn";

/** A child's own action stored on the device until the server has taken it. */
export type OutboxItem = {
  /** Equals `idempotencyKey` for purchases, a random uuid otherwise. */
  id: string;
  userId: string;
  kind: OutboxKind;
  /** Exactly the feature schema's input, as the online form would post it. */
  payload: unknown;
  /** Created once by the caller and never regenerated, so a resend is a replay. */
  idempotencyKey: string;
  occurredAt: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  status: "waiting" | "sending" | "needs_look";
  message?: string;
};

export type SendOutcome =
  | { kind: "done"; data: unknown }
  | { kind: "refused"; message: string }
  | { kind: "retry" }
  | { kind: "unauthorized" };

export type SubmitResult =
  | { status: "sent"; data: unknown }
  | { status: "queued" }
  | { status: "refused"; message: string }
  | { status: "unsaved" };

import type { PaymentProviderId } from "@jarso/core/lib";

export const frequencies = ["weekly", "monthly", "quarterly", "annual"] as const;
export type Frequency = (typeof frequencies)[number];

export type ScheduleStatus = "active" | "paused" | "stopped";

/** The child's latest allowance schedule. Dates are family-local ISO `YYYY-MM-DD`. */
export type Schedule = {
  id: string;
  amountMinor: number;
  frequency: Frequency;
  status: ScheduleStatus;
  /** Planned Save part of each allowance (Spend is the rest, ADR 0019); null = no plan set. */
  saveMinor: number | null;
  /** First date of the current cadence; every due date is counted from it. */
  anchorOn: string;
  /** Next period to fall due; null when stopped or paused until a parent resumes. */
  nextDueOn: string | null;
  pausedThrough: string | null;
  pauseMessage: string | null;
  /** Card auto charge is on for this schedule. Always false for the child. */
  autoCharge: boolean;
  /** The provider whose saved card pays; null when off. Always null for the child. */
  autoChargeProvider: PaymentProviderId | null;
  /** The signed-in parent turned auto charge on (it charges their card). False for the child. */
  autoChargeMine: boolean;
};

/** Something waiting for the parent to hand over (parents only: it includes gifts). */
export type DueItem = {
  kind: "allowance" | "gift";
  id: string;
  dueOn: string;
  amountMinor: number;
  note: string | null;
  /** The allowance's planned Save part when it fell due; null for gifts and allowances without one. */
  plannedSaveMinor: number | null;
};

/** A due item with the child it is for, for lists across the whole family. */
export type ChildDueItem = DueItem & { childId: string; nickname: string };

export type GiftStatus = "pending" | "given" | "cancelled";

export type Gift = {
  id: string;
  amountMinor: number;
  giveOn: string;
  note: string | null;
  status: GiftStatus;
  /** Card auto charge is on for this gift. */
  autoCharge: boolean;
  /** The provider whose saved card pays; null when off. */
  autoChargeProvider: PaymentProviderId | null;
  /** The signed-in parent turned auto charge on (it charges their card). */
  autoChargeMine: boolean;
};

/** How a handover was split: cash to Spend, the rest kept as Save. Minor units. */
export type Split = { cash: number; saved: number };

export type HandoverResult = "confirmed" | "already_confirmed";
export type NotGivenResult = "closed" | "already_handled";

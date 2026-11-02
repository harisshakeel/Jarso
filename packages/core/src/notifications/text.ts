import { categoryOf } from "@jarso/core/ledger";
import { formatMoney } from "@jarso/core/lib";
import { type FailureCode, failureCopy } from "@jarso/core/payments";
import type { Notice } from "./types";

export type NoticeRole = "parent" | "child";

/**
 * The due item a card payment notice is about. The payload carries the payment row's source
 * (written from the row when the notice is made), so live notices resolve without a read.
 */
export function paymentItem(notice: Notice): { kind: "allowance" | "gift"; id: string } | null {
  const { source_type: type, source_id: id } = notice.payload;
  if (typeof id !== "string" || id === "") return null;
  if (type === "occurrence") return { kind: "allowance", id };
  if (type === "parent_gift") return { kind: "gift", id };
  return null;
}

function failureReason(payload: Record<string, unknown>): string | null {
  const code = payload.failure_code;
  return typeof code === "string" && Object.hasOwn(failureCopy, code)
    ? failureCopy[code as FailureCode]
    : null;
}

function minor(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Title and detail for a notice row, in the voice of docs/design.md §9. */
export function noticeText(
  notice: Notice,
  role: NoticeRole,
  currency: string,
): { title: string; detail: string } {
  const money = (key: string) => {
    const value = minor(notice.payload, key);
    return value === null ? null : formatMoney(value, currency, { showMinor: "nonzero" });
  };
  const amount = money("amount_minor");
  const name = notice.childName || "Your child";

  switch (notice.kind) {
    case "allowance_due":
      return role === "child"
        ? {
            title: `Your ${amount ?? ""} allowance is due`.replace("  ", " "),
            detail: "Your parent will hand it over.",
          }
        : {
            title: `${name}'s ${amount ?? ""} allowance is due`.replace("  ", " "),
            detail: "Ready to hand over.",
          };
    case "handover_reminder": {
      const days = minor(notice.payload, "days_overdue");
      return {
        title: `Still due: ${name}'s ${amount ?? ""} allowance`.replace("  ", " "),
        detail: days === null ? "Not handed over yet." : `Due ${plural(days, "day")} ago`,
      };
    }
    case "limit_exceeded": {
      const limit = money("limit_minor");
      return {
        title: `${name} went over a spending limit`,
        detail:
          amount && limit
            ? `Spent ${amount} against a limit of ${limit}.`
            : "Take a look together.",
      };
    }
    case "withdrawal_requested":
      return {
        title: `${name} asked to take money out of Save`,
        detail: amount ? `${amount}. Your answer is waiting.` : "Your answer is waiting.",
      };
    case "deposit_requested":
      return {
        title: `${name} asked to add money to Save`,
        detail: amount ? `${amount}. Your answer is waiting.` : "Your answer is waiting.",
      };
    case "emergency_requested": {
      const reason = typeof notice.payload.reason === "string" ? notice.payload.reason : null;
      return {
        title: `${name} asked for extra money`,
        detail: [amount, reason].filter(Boolean).join(": ") || "Your answer is waiting.",
      };
    }
    case "emergency_decided": {
      const { approved } = notice.payload;
      if (approved === true) {
        return {
          title: "Your parent said yes to extra money",
          detail: amount ? `${amount} will come to Spend when they hand it over.` : "Take a look.",
        };
      }
      if (approved === false) {
        return { title: "Your parent said not now", detail: "Talk about it together." };
      }
      return { title: "Your parent answered your request", detail: "Take a look." };
    }
    case "withdrawal_decided":
    case "deposit_decided": {
      const { approved, decision } = notice.payload;
      if (notice.kind === "deposit_decided" && approved === false) {
        return {
          title: amount ? `Your ${amount} wasn't added to Save` : "Your money wasn't added to Save",
          detail: "It's still in Spend. Talk to your parent.",
        };
      }
      if (approved === true || decision === "approved") {
        return { title: "Your parent said yes", detail: amount ?? "Take a look." };
      }
      if (approved === false || decision === "declined") {
        return { title: "Your parent said not now", detail: "You can ask again later." };
      }
      return { title: "Your parent answered your request", detail: "Take a look." };
    }
    case "card_charge_failed": {
      const what = paymentItem(notice)?.kind === "gift" ? "gift" : "allowance";
      const reason = failureReason(notice.payload);
      return {
        title: `Card payment for ${name}'s ${what} didn't go through`,
        detail: reason ? `${reason} Hand it over another way.` : "Hand it over another way.",
      };
    }
    case "money_received": {
      const from = categoryOf(
        typeof notice.payload.category === "string" ? notice.payload.category : null,
        "received",
      ).label;
      return {
        title: `${name} wrote down ${amount ?? "money"} from ${from}`,
        detail: notice.payload.jar === "save" ? "Added to Save." : "Added to Spend.",
      };
    }
    case "entry_corrected": {
      const old = money("old_amount_minor");
      return {
        title:
          notice.payload.kind === "gift_in"
            ? `${name} fixed money they got`
            : `${name} fixed a purchase`,
        detail: old && amount ? `${old} → ${amount}` : "Take a look.",
      };
    }
    default:
      return { title: "Something new", detail: "Take a look." };
  }
}

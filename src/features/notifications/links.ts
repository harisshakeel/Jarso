import type { Route } from "next";
import { routes } from "@/config";
import { formatMoney } from "@/lib";
import type { Notice } from "./types";

type Role = "parent" | "child";

/** Where a notice opens: the record as it is now, not as it was when the notice was sent. */
export function noticeHref(notice: Notice, role: Role): Route {
  if (role === "parent") {
    if (notice.sourceType === "allowance_occurrence") {
      return routes.parentHandover(notice.childId, "allowance", notice.sourceId);
    }
    if (notice.sourceType === "request") return routes.parentChild(notice.childId);
    return routes.parentChildHistory(notice.childId);
  }
  return notice.sourceType === "ledger_entry" ? routes.childDiary : routes.child;
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
  role: Role,
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
    default:
      return { title: "Something new", detail: "Take a look." };
  }
}

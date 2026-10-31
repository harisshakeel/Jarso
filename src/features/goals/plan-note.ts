import { formatMoney } from "@/lib";
import type { Goal } from "./types";

/**
 * The parent's one-line view of the child's plan, for the handover screen. The plan is the
 * child's own estimate; it never changes the handover's starting split.
 */
export function planNote(
  nickname: string,
  goal: Pick<Goal, "name" | "emoji" | "planMinor"> | null,
  currency: string,
): string | null {
  if (!goal?.planMinor) return null;
  const plan = formatMoney(goal.planMinor, currency, { showMinor: "nonzero" });
  return `${nickname} plans to save ${plan} each time toward ${goal.emoji} ${goal.name}`;
}

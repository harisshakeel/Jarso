import type { SavingsRequest } from "@jarso/core/requests";

/** A card under the hero: something a child would want to know first. */
export type HomeMoment =
  | { kind: "said-yes"; request: SavingsRequest }
  | { kind: "allowance-due"; amountMinor: number }
  | { kind: "waiting"; request: SavingsRequest; more: number };

const MAX_MOMENTS = 3;

const newestFirst = (a: SavingsRequest, b: SavingsRequest) =>
  b.occurredAt.localeCompare(a.occurredAt);

/**
 * Which cards Home shows, most welcome first: parent said yes, pocket money due, then one
 * waiting ask. Rejected and cancelled asks never show. At most 3.
 */
export function selectMoments(input: {
  requests: SavingsRequest[] | null;
  due: { totalMinor: number; count: number } | null;
}): HomeMoment[] {
  const requests = input.requests ?? [];
  const moments: HomeMoment[] = requests
    .filter((r) => r.status === "approved" && (r.kind === "withdrawal" || r.kind === "emergency"))
    .sort(newestFirst)
    .map((request) => ({ kind: "said-yes", request }));
  if (input.due && input.due.count > 0) {
    moments.push({ kind: "allowance-due", amountMinor: input.due.totalMinor });
  }
  const pending = requests.filter((r) => r.status === "pending").sort(newestFirst);
  const [newest] = pending;
  if (newest) moments.push({ kind: "waiting", request: newest, more: pending.length - 1 });
  return moments.slice(0, MAX_MOMENTS);
}

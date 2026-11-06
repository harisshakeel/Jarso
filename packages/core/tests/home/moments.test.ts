import type { RequestKind, RequestStatus, SavingsRequest } from "@jarso/core/requests";
import { describe, expect, it } from "vitest";
import { selectMoments } from "../../src/home";

let n = 0;
const req = (kind: RequestKind, status: RequestStatus, occurredAt: string): SavingsRequest => ({
  id: `r${++n}`,
  kind,
  status,
  amountMinor: 5000,
  reason: null,
  auto: false,
  occurredAt,
});
const due = { totalMinor: 10000, count: 1 };

describe("selectMoments", () => {
  it("said-yes first, then due, then waiting", () => {
    const older = req("withdrawal", "approved", "2026-11-04T10:00:00Z");
    const newer = req("emergency", "approved", "2026-11-05T10:00:00Z");
    const pending = req("deposit", "pending", "2026-11-05T12:00:00Z");
    const kinds = selectMoments({ requests: [older, pending, newer], due }).map((m) => m.kind);
    expect(kinds).toEqual(["said-yes", "said-yes", "allowance-due"]);
    const first = selectMoments({ requests: [older, newer], due })[0];
    expect(first).toEqual({ kind: "said-yes", request: newer });
    expect(selectMoments({ requests: [pending], due }).map((m) => m.kind)).toEqual([
      "allowance-due",
      "waiting",
    ]);
  });
  it("caps at 3", () => {
    const list = [1, 2, 3, 4].map((i) => req("withdrawal", "approved", `2026-11-0${i}T00:00:00Z`));
    expect(selectMoments({ requests: list, due })).toHaveLength(3);
  });
  it("rejected and cancelled never show", () => {
    const list = [
      req("withdrawal", "rejected", "2026-11-01T00:00:00Z"),
      req("deposit", "cancelled", "2026-11-02T00:00:00Z"),
    ];
    expect(selectMoments({ requests: list, due: null })).toEqual([]);
  });
  it("waiting counts the others", () => {
    const a = req("deposit", "pending", "2026-11-01T00:00:00Z");
    const b = req("withdrawal", "pending", "2026-11-03T00:00:00Z");
    const c = req("emergency", "pending", "2026-11-02T00:00:00Z");
    expect(selectMoments({ requests: [a, b, c], due: null })).toEqual([
      { kind: "waiting", request: b, more: 2 },
    ]);
  });
  it("null inputs give no moments", () =>
    expect(selectMoments({ requests: null, due: null })).toEqual([]));
  it("deposit approved is not a said-yes", () =>
    expect(
      selectMoments({ requests: [req("deposit", "approved", "2026-11-01T00:00:00Z")], due: null }),
    ).toEqual([]));
});

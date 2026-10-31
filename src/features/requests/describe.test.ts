import { describe, expect, it } from "vitest";
import { overCapMessage, statusLabel } from "./describe";
import { type RequestKind, type RequestStatus, requestStatuses } from "./types";

describe("statusLabel", () => {
  const expected: Record<RequestStatus, string> = {
    pending: "Waiting",
    approved: "Approved",
    handed_over: "Done",
    confirmed: "Done",
    rejected: "Not approved",
    cancelled: "Cancelled",
  };
  const kinds: RequestKind[] = ["withdrawal", "deposit", "emergency"];
  it.each(kinds.flatMap((kind) => requestStatuses.map((status) => [kind, status] as const)))(
    "%s %s",
    (kind, status) => {
      expect(statusLabel(kind, status)).toBe(expected[status]);
    },
  );
});

describe("overCapMessage", () => {
  it("names the cap and what is already used", () => {
    expect(overCapMessage("week", 1500, 1000, "GBP")).toBe(
      "You can take out up to £15 a week. £10 is already taken out or waiting.",
    );
  });

  it("drops the second sentence when nothing is used (a per-time cap)", () => {
    expect(overCapMessage("item", 500, 0, "GBP")).toBe("You can take out up to £5 per time.");
  });
});

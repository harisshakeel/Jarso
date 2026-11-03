import {
  depositMessage,
  emergencyMessage,
  overCapMessage,
  requestAlreadyMovedOnMessage,
  withdrawalMessage,
} from "@jarso/core/requests";
import { describe, expect, it } from "vitest";

describe("depositMessage", () => {
  it("says what happened to the deposit", () => {
    expect(depositMessage({ status: "pending", requestId: "r" }, "USD")).toBe(
      "Waiting for your parent to confirm",
    );
    expect(depositMessage({ status: "confirmed", requestId: "r" }, "USD")).toBe("Added to Save");
    expect(depositMessage({ status: "done", requestId: "r" }, "USD")).toBe(
      "Added to Save. Your parent knows.",
    );
    expect(depositMessage({ status: "already_sent", requestId: "r" }, "USD")).toBe(
      "Already sent to your parent",
    );
    expect(depositMessage({ status: "over_available", availableMinor: 250 }, "USD")).toBe(
      "Spend has US$2.50",
    );
  });
});

describe("withdrawalMessage", () => {
  it("says what happened to the ask", () => {
    expect(withdrawalMessage({ status: "pending", requestId: "r" }, "USD")).toBe(
      "Sent to your parent",
    );
    expect(withdrawalMessage({ status: "approved", requestId: "r" }, "USD")).toBe(
      "Approved, your parent will hand it over",
    );
    expect(withdrawalMessage({ status: "done", requestId: "r" }, "USD")).toBe(
      "Done. Your parent knows.",
    );
    expect(withdrawalMessage({ status: "already_sent", requestId: "r" }, "USD")).toBe(
      "Already sent to your parent",
    );
    expect(withdrawalMessage({ status: "over_available", availableMinor: 1000 }, "USD")).toBe(
      "You can take out up to US$10",
    );
  });

  it("explains an over-cap ask", () => {
    const message = withdrawalMessage(
      { status: "over_cap", period: "week", capMinor: 500, usedMinor: 400 },
      "USD",
    );
    expect(message).toBe(overCapMessage("week", 500, 400, "USD"));
  });
});

describe("emergencyMessage", () => {
  it("says what happened to the ask", () => {
    expect(emergencyMessage({ status: "pending", requestId: "r" }, "USD")).toBe(
      "Sent to your parent",
    );
    expect(emergencyMessage({ status: "already_sent", requestId: "r" }, "USD")).toBe(
      "Already sent to your parent",
    );
  });
});

describe("requestAlreadyMovedOnMessage", () => {
  it("keeps the exact line the web and the phone show", () => {
    expect(requestAlreadyMovedOnMessage).toBe("This one already moved on.");
  });
});

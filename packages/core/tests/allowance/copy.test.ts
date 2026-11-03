import { allowanceErrors } from "@jarso/core/allowance";
import { describe, expect, it } from "vitest";

describe("allowanceErrors", () => {
  it("keeps the web service's lines word for word", () => {
    expect(allowanceErrors).toEqual({
      alreadyExists: "There's already an allowance. Change it instead.",
      nextOn: "Pick a later date: after the last allowance, after any pause, and within a year.",
      stopped: "This allowance has stopped. Set up a new one.",
      notRunning: "This allowance isn't running, so it can't pause.",
      notPaused: "This allowance isn't paused.",
      alreadyStopped: "This allowance has already stopped.",
      giftDone: "This gift was already handed over or cancelled.",
      notGiven: "This allowance was marked as not given, so nothing was recorded.",
      giftCancelled: "This gift was cancelled, so nothing was recorded.",
      giftNotDue: "This gift isn't due yet.",
      giftDatePast: "Pick today or a later date.",
    });
  });
});

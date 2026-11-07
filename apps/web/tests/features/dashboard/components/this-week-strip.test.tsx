import type { DashboardChild } from "@jarso/core/dashboard";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThisWeekStrip } from "@/features/dashboard/components/this-week-strip";

afterEach(cleanup);

// Friday 30 October 2026, so this week started on Monday the 26th.
const today = "2026-10-30";

const child = (
  over: Partial<DashboardChild> & { id: string; nickname: string },
): DashboardChild => ({
  slot: 1,
  spendMinor: 0,
  saveMinor: 0,
  reservedMinor: 0,
  goal: null,
  schedule: null,
  due: [],
  gifts: [],
  history: [],
  balances: null,
  flaggedChats: 0,
  ...over,
});

describe("ThisWeekStrip", () => {
  it("says what is still to hand over and what comes next", () => {
    render(
      <ThisWeekStrip
        today={today}
        currency="GBP"
        kids={[
          child({
            id: "a",
            nickname: "Aisha",
            due: [
              {
                kind: "allowance",
                id: "o",
                dueOn: "2026-10-29",
                amountMinor: 500,
                note: null,
                plannedSaveMinor: null,
              },
            ],
            gifts: [
              {
                id: "g",
                amountMinor: 1000,
                giveOn: "2026-11-02",
                note: null,
                status: "pending",
                autoCharge: false,
                autoChargeProvider: null,
                autoChargeMine: false,
              },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText("1 · £5.00")).toBeInTheDocument();
    expect(screen.getByText("2 Nov · Aisha: Gift, £10.00")).toBeInTheDocument();
  });

  it("is calm with nothing waiting or coming", () => {
    render(
      <ThisWeekStrip today={today} currency="GBP" kids={[child({ id: "a", nickname: "Aisha" })]} />,
    );
    expect(screen.getByText("Nothing in the next two weeks")).toBeInTheDocument();
  });
});

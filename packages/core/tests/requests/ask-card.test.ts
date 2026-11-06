import { askCard, askCardCopy } from "@jarso/core/requests";
import { describe, expect, it } from "vitest";

const pending = { kind: "withdrawal", status: "pending", reason: null } as const;

describe("askCard", () => {
  it("a put-in asks Got it or Not yet", () => {
    expect(askCard({ kind: "deposit", status: "pending", reason: null }, "Sam", "£5")).toEqual({
      kind: "receive",
      title: "Sam is saving £5",
      line: "Got the cash?",
      yes: "Got it",
      no: "Not yet",
    });
  });

  it("a take-out asks Yes or Not now with its reason", () => {
    expect(askCard({ ...pending, reason: "football boots" }, "Sam", "£6")).toEqual({
      kind: "decide",
      title: "Sam asks £6 from Save",
      line: "For: football boots",
      yes: "Yes",
      no: "Not now",
    });
  });

  it("a take-out with no reason says From Save", () => {
    expect(askCard(pending, "Sam", "£6").line).toBe(askCardCopy.fromSave);
  });

  it("an ask for extra says extra with its reason", () => {
    const card = askCard({ kind: "emergency", status: "pending", reason: "Bus fare" }, "Mia", "£2");
    expect(card).toMatchObject({
      kind: "decide",
      title: "Mia asks £2 extra",
      line: "For: Bus fare",
    });
    expect(askCard({ kind: "emergency", status: "pending", reason: null }, "Mia", "£2").line).toBe(
      askCardCopy.extra,
    );
  });

  it("an approved take-out is handed over or not", () => {
    expect(askCard({ ...pending, status: "approved" }, "Sam", "£6")).toEqual({
      kind: "handover",
      title: "Hand £6 to Sam",
      line: "Approved · from Save",
      yes: "Handed over",
      no: "Didn't give it",
    });
  });

  it("an approved extra says extra", () => {
    expect(
      askCard({ kind: "emergency", status: "approved", reason: "Bus" }, "Sam", "£2").line,
    ).toBe(askCardCopy.approvedExtra);
  });

  it("answer labels stay short", () => {
    const cards = [
      askCard({ kind: "deposit", status: "pending", reason: null }, "Sam", "£5"),
      askCard(pending, "Sam", "£5"),
      askCard({ ...pending, status: "approved" }, "Sam", "£5"),
      askCard({ kind: "emergency", status: "pending", reason: "x" }, "Sam", "£5"),
    ];
    for (const card of cards) {
      expect(card.yes.split(" ").length).toBeLessThanOrEqual(3);
      expect(card.no.split(" ").length).toBeLessThanOrEqual(3);
      expect(card.title).not.toMatch(/overdue|late|!/i);
    }
  });
});

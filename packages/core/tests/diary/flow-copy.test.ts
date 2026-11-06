import { describe, expect, it } from "vitest";
import { purchaseFlowCopy, receivedFlowCopy } from "../../src/diary";

describe("diary flow copy", () => {
  it("done repeats the choice", () =>
    expect(purchaseFlowCopy.done("₹45", "Snacks")).toBe("Done · ₹45 snacks"));
  it("goalReached is short", () =>
    expect(receivedFlowCopy.goalReached("⚽", "Boots")).toBe("⚽ Boots: that gets you there!"));

  it("goalAfter matches the mockup", () =>
    expect(receivedFlowCopy.goalAfter("⚽", "Boots", "₹0")).toBe("⚽ Boots: ₹0 to go after this!"));
  it("small lines", () => {
    expect(purchaseFlowCopy.nameHint("Name it")).toBe("Name it (if you want)");
    expect(receivedFlowCopy.save.hint("Mum")).toBe("Give it to Mum");
    expect(receivedFlowCopy.submit("Save")).toBe("Put it in Save");
  });
});

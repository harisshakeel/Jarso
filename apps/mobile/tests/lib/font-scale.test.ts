import { fontScaleCap, isMoneyClass, MAX_TITLE_FONT_SCALE } from "@/lib";

describe("font scale cap", () => {
  it("is 1.3", () => expect(MAX_TITLE_FONT_SCALE).toBe(1.3));

  it.each(["text-display", "font-sans-bold text-h3", "text-money", "text-money-xl text-primary"])(
    "caps %s",
    (c) => expect(fontScaleCap(c)).toBe(1.3),
  );

  it.each([
    undefined,
    "text-body",
    "text-small",
    "text-caption",
    "text-body-parent",
    "text-moneyish",
  ])("leaves %s", (c) => expect(fontScaleCap(c)).toBeUndefined());

  it("knows money classes", () => {
    expect(isMoneyClass("text-money-l")).toBe(true);
    expect(isMoneyClass("text-h1")).toBe(false);
    expect(isMoneyClass(undefined)).toBe(false);
  });
});

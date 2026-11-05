import { PAYMENT_PROVIDER_IDS } from "@jarso/core/lib";
import { providerLogo } from "@jarso/core/payments";
import { describe, expect, it } from "vitest";

describe("providerLogo", () => {
  it.each(PAYMENT_PROVIDER_IDS.filter((id) => id !== "fake"))(
    "%s has a mark and a colour",
    (id) => {
      const logo = providerLogo(id);
      expect(logo).not.toBeNull();
      expect(logo?.viewBox).toBe("0 0 24 24");
      expect(logo?.path).toMatch(/^M[\d.]/);
      expect(logo?.color).toMatch(/^#[0-9A-F]{6}$/i);
    },
  );

  it("uses each provider's brand colour", () => {
    expect(providerLogo("stripe")?.color).toBe("#635BFF");
    expect(providerLogo("razorpay")?.color).toBe("#0C2451");
  });

  it("the fake provider has none", () => {
    expect(providerLogo("fake")).toBeNull();
  });
});

import {
  isOtherCurrency,
  MAX_PHOTO_BYTES,
  priceQuestion,
  readPrice,
  readPriceSchema,
  splitDataUrl,
  tidyPhotoLabel,
} from "@jarso/core/guide";
import { describe, expect, it } from "vitest";

describe("readPrice", () => {
  it("parses the price the model read as text, in the family's currency", () => {
    expect(
      readPrice({ found: true, price: "£12.99", currency: "£", label: "headphones" }, "GBP"),
    ).toEqual({ found: true, priceMinor: 1299, label: "headphones", currency: "£" });
    expect(readPrice({ found: true, price: "12,99", currency: "€", label: null }, "EUR")).toEqual({
      found: true,
      priceMinor: 1299,
      label: null,
      currency: "€",
    });
    expect(readPrice({ found: true, price: "1,200", currency: null, label: null }, "GBP")).toEqual(
      expect.objectContaining({ priceMinor: 120000 }),
    );
  });

  it("counts anything it can't trust as not found", () => {
    expect(readPrice(null, "GBP")).toEqual({ found: false });
    expect(readPrice({ found: false, price: "5", currency: null, label: null }, "GBP")).toEqual({
      found: false,
    });
    expect(readPrice({ found: true, price: "free", currency: null, label: null }, "GBP")).toEqual({
      found: false,
    });
    expect(readPrice({ found: true, price: "0", currency: null, label: null }, "GBP")).toEqual({
      found: false,
    });
    // Over the goal limit.
    expect(readPrice({ found: true, price: "25000", currency: null, label: null }, "GBP")).toEqual({
      found: false,
    });
    expect(readPrice({ price: "5" }, "GBP")).toEqual({ found: false });
  });
});

describe("isOtherCurrency", () => {
  it("spots a price clearly in another currency, and trusts anything unclear", () => {
    expect(isOtherCurrency("$", "GBP")).toBe(true);
    expect(isOtherCurrency("USD", "GBP")).toBe(true);
    expect(isOtherCurrency("£", "GBP")).toBe(false);
    expect(isOtherCurrency("$", "AUD")).toBe(false);
    expect(isOtherCurrency("gbp", "GBP")).toBe(false);
    expect(isOtherCurrency(null, "GBP")).toBe(false);
    expect(isOtherCurrency("pounds", "GBP")).toBe(false);
  });
});

describe("tidyPhotoLabel", () => {
  it("keeps four plain words", () => {
    expect(tidyPhotoLabel("Wireless noise-cancelling headphones, black (large)")).toBe(
      "Wireless noise-cancelling",
    );
    expect(tidyPhotoLabel("Red <b>bike</b> helmet")).toBe("Red b bike b");
    expect(tidyPhotoLabel("football boots!")).toBe("football boots");
    expect(tidyPhotoLabel("  ")).toBeNull();
    expect(tidyPhotoLabel(null)).toBeNull();
  });
});

describe("priceQuestion", () => {
  it("asks in the child's voice", () => {
    expect(priceQuestion(1299, "Headphones", "GBP")).toBe("Can I afford £12.99 for headphones?");
    expect(priceQuestion(1299, "LEGO set", "GBP")).toBe("Can I afford £12.99 for LEGO set?");
    expect(priceQuestion(500, null, "GBP")).toBe("Can I afford £5?");
  });
});

describe("readPriceSchema", () => {
  it("takes a JPEG, PNG or WebP data URL within the size limit", () => {
    expect(readPriceSchema.safeParse({ image: "data:image/jpeg;base64,/9j/AAAA" }).success).toBe(
      true,
    );
    expect(readPriceSchema.safeParse({ image: "data:image/gif;base64,R0lGOD" }).success).toBe(
      false,
    );
    expect(readPriceSchema.safeParse({ image: "https://example.test/a.jpg" }).success).toBe(false);
    const big = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8)}`;
    expect(readPriceSchema.safeParse({ image: big }).success).toBe(false);
  });

  it("splits a checked data URL into its type and data", () => {
    expect(splitDataUrl("data:image/webp;base64,UklGR==")).toEqual({
      mediaType: "image/webp",
      data: "UklGR==",
    });
  });
});

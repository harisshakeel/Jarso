import { mobileFontSize } from "@jarso/brand/tokens";
import resolveConfig from "tailwindcss/resolveConfig";

// biome-ignore lint/suspicious/noExplicitAny: the config is plain CommonJS
const config = resolveConfig(require("../tailwind.config.js") as any);
const fontSizes = config.theme.fontSize as unknown as Record<
  string,
  [string, Record<string, string>]
>;

describe("phone type scale", () => {
  it("maps every phone token into the theme", () => {
    for (const [key, { size, lineHeight }] of Object.entries(mobileFontSize))
      expect(fontSizes[key]).toEqual([
        `${size}px`,
        expect.objectContaining({ lineHeight: `${lineHeight}px` }),
      ]);
    expect(fontSizes.h1?.[1]).toEqual({
      lineHeight: "28px",
      letterSpacing: "-0.3px",
      fontWeight: "800",
    });
  });
});

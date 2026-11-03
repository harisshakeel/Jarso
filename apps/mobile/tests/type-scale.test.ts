import { mobileFontSize } from "@jarso/brand/tokens";
import resolveConfig from "tailwindcss/resolveConfig";
import { read, relative, root, sourceFiles } from "./source-files";

// The screen components behind the five tabs and Me.
const TAB_SCREEN_FILES = [
  "diary-screen",
  "history-list",
  "learn-screen",
  "news-screen",
  "guide-screens",
  "settings-screen",
].map((name) => sourceFiles().find((f) => f.endsWith(`/${name}.tsx`)) ?? `${root}/missing/${name}`);

// biome-ignore lint/suspicious/noExplicitAny: the config is plain CommonJS
const config = resolveConfig(require("../tailwind.config.js") as any);
const fontSizes = config.theme.fontSize as unknown as Record<
  string,
  [string, Record<string, string>]
>;

/** Every match of `re` as "<match> (<path>:<line>)", so a failure names the spot. */
function hits(re: RegExp, only: string[] = sourceFiles()): string[] {
  return only.flatMap((file) => {
    const source = read(file);
    return [...source.matchAll(re)].map((m) => {
      const line = source.slice(0, m.index).split("\n").length;
      return `${m[0]} (${relative(file)}:${line})`;
    });
  });
}

function filesWithMoreThanOne(re: RegExp): string[] {
  return sourceFiles()
    .filter((file) => (read(file).match(re) ?? []).length > 1)
    .map(relative);
}

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

  it("uses no raw Tailwind size class in the app", () => {
    // prefixed variants (md:text-sm, dark:text-lg) count too
    expect(hits(/(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g)).toEqual([]);
  });

  it("offers no size outside the phone scale", () => {
    expect(Object.keys(fontSizes).sort()).toEqual(Object.keys(mobileFontSize).sort());
  });

  it("uses Display or Money XL at most once per file", () => {
    expect(filesWithMoreThanOne(/(?<![\w-])text-(?:display|money-xl)(?![\w-])/g)).toEqual([]);
  });

  it("uses no all-caps labels", () => {
    expect(hits(/(?<![\w-])uppercase(?![\w-])/g)).toEqual([]);
  });

  it("titles every tab screen at h1", () => {
    expect(TAB_SCREEN_FILES.every((f) => !f.includes("/missing/"))).toBe(true);
    expect(hits(/accessibilityRole="header"\s+className="[^"]*text-h2/g, TAB_SCREEN_FILES)).toEqual(
      [],
    );
  });
});

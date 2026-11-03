import { readFileSync } from "node:fs";
import { formatHex, formatHex8, parse } from "culori";
import { describe, expect, it } from "vitest";
import { fontSize, mobileFontSize, palette, radius, semantic } from "../tokens";

const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Raw `--name: value` declarations of the block(s) opened by `selector` (any brace layout). */
function block(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`(?:^|[}\\s])${selector.replace(/[.@]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
  let found = false;
  for (const block of css.matchAll(re)) {
    found = true;
    for (const m of (block[1] as string).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      out[m[1] as string] = (m[2] as string).trim();
    }
  }
  if (!found) throw new Error(`no ${selector} block in tokens.css`);
  return out;
}

const theme = block("@theme");
const root = block(":root");
const dark = block(".dark");

/** Native colour: lowercase #rrggbb, or #rrggbbaa when alpha < 1. oklch is converted to sRGB. */
function hex(value: string): string {
  const c = parse(value);
  if (!c) throw new Error(`cannot parse colour ${value}`);
  return ((c.alpha ?? 1) < 1 ? formatHex8(c) : formatHex(c)).toLowerCase();
}

/** Resolves `var(--x)` against `vars`, then converts to hex. */
function colour(value: string, vars: Record<string, string>): string {
  const ref = /^var\(--([\w-]+)\)$/.exec(value);
  if (!ref) return hex(value);
  return colour(vars[ref[1] as string] as string, vars);
}

const px = (rem: string): number => Number.parseFloat(rem) * 16;
const isShadow = (k: string) => k.startsWith("shadow-");

function semanticFor(overrides: Record<string, string>): Record<string, string> {
  // `.dark` inherits anything only defined in :root; aliases resolve in the mode's own scope.
  const { radius: _radius, ...base } = root;
  const merged = { ...base, ...overrides };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (!isShadow(k)) out[k] = colour(v, merged);
  }
  return out;
}

describe("brand tokens parity with tokens.css", () => {
  it("palette equals every --color-* as hex (scales nested by step)", () => {
    const expected: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(theme)) {
      if (!key.startsWith("color-")) continue;
      const name = key.slice("color-".length);
      const m = /^(.+)-(\d+)$/.exec(name);
      if (m) {
        const scale = (expected[m[1] as string] ?? {}) as Record<string, string>;
        scale[m[2] as string] = hex(value);
        expected[m[1] as string] = scale;
      } else {
        expected[name] = hex(value);
      }
    }
    expect(palette).toEqual(expected);
  });

  it("semantic.light equals :root colours, resolved, minus radius and shadows", () => {
    expect(semantic.light).toEqual(semanticFor({}));
  });

  it("semantic.dark equals .dark over :root, resolved", () => {
    expect(semantic.dark).toEqual(semanticFor(dark));
  });

  it("light and dark have the same keys", () => {
    expect(Object.keys(semantic.dark).sort()).toEqual(Object.keys(semantic.light).sort());
  });

  it("radius is --radius in px", () => {
    expect(radius).toEqual({ base: px(root.radius as string) });
  });

  it("fontSize equals every --text-* in px / numbers", () => {
    const expected: Record<string, Record<string, number>> = {};
    for (const [key, value] of Object.entries(theme)) {
      if (!key.startsWith("text-")) continue;
      const [name, prop] = key.slice("text-".length).split("--") as [string, string | undefined];
      const entry = expected[name] ?? {};
      expected[name] = entry;
      if (!prop) entry.size = px(value);
      else if (prop === "line-height") entry.lineHeight = px(value);
      else if (prop === "font-weight") entry.fontWeight = Number(value);
      else if (prop === "letter-spacing")
        entry.letterSpacing = 0; // set below (needs size)
      else throw new Error(`unhandled ${key}`);
    }
    for (const [key, value] of Object.entries(theme)) {
      const m = /^text-(.+)--letter-spacing$/.exec(key);
      const entry = m ? expected[m[1] as string] : undefined;
      if (entry) entry.letterSpacing = Number.parseFloat(value) * (entry.size ?? 0);
    }
    expect(fontSize).toEqual(expected);
  });
});

describe("phone type scale", () => {
  it("covers every web size token plus body, body-parent, small and caption", () => {
    expect(Object.keys(mobileFontSize).sort()).toEqual(
      [...Object.keys(fontSize), "body", "body-parent", "small", "caption"].sort(),
    );
  });

  it("matches the spec table", () => {
    expect(mobileFontSize.display).toEqual({
      size: 26,
      lineHeight: 32,
      fontWeight: 800,
      letterSpacing: -0.4,
    });
    expect(mobileFontSize.h1).toEqual({
      size: 22,
      lineHeight: 28,
      fontWeight: 800,
      letterSpacing: -0.3,
    });
    expect(mobileFontSize.h2).toEqual({ size: 18, lineHeight: 24, fontWeight: 700 });
    expect(mobileFontSize.h3).toEqual({ size: 16, lineHeight: 22, fontWeight: 700 });
    expect(mobileFontSize.body).toEqual({ size: 16, lineHeight: 22 });
    expect(mobileFontSize["body-parent"]).toEqual({ size: 15, lineHeight: 21 });
    expect(mobileFontSize.small).toEqual({ size: 13, lineHeight: 18 });
    expect(mobileFontSize.caption).toEqual({ size: 12, lineHeight: 16 });
    expect(mobileFontSize["money-xl"]).toEqual({
      size: 32,
      lineHeight: 36,
      fontWeight: 800,
      letterSpacing: -0.64,
    });
    expect(mobileFontSize["money-l"]).toEqual({ size: 22, lineHeight: 26, fontWeight: 700 });
    expect(mobileFontSize.money).toEqual({ size: 17, lineHeight: 22, fontWeight: 700 });
  });

  it("is never larger than the web for a shared token", () => {
    for (const key of Object.keys(fontSize) as (keyof typeof fontSize)[])
      expect(mobileFontSize[key].size).toBeLessThanOrEqual(fontSize[key].size);
  });

  it("keeps child reading text at 16 or more", () => {
    expect(mobileFontSize.body.size).toBeGreaterThanOrEqual(16);
  });
});

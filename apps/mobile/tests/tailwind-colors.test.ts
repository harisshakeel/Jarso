import { palette } from "@jarso/brand/tokens";
import resolveConfig from "tailwindcss/resolveConfig";

// Plain requires: the app does not take node's type definitions.
const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

declare const __dirname: string;
const root: string = join(__dirname, "..");
// biome-ignore lint/suspicious/noExplicitAny: the config is plain CommonJS
const config = resolveConfig(require("../tailwind.config.js") as any);
const colors = config.theme.colors as Record<string, string | Record<string, string>>;

function files(dir: string): string[] {
  return (readdirSync(dir) as string[]).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("tailwind colours", () => {
  it("keeps the semantic colour as DEFAULT beside the palette scale", () => {
    const gold = colors.gold as Record<string, string>;
    expect(gold.DEFAULT).toBe("var(--gold)");
    expect(gold["300"]).toBe(palette.gold["300"]);
  });

  it("resolves every colour class used in the app", () => {
    const names = Object.keys(colors).sort((a, b) => b.length - a.length);
    const missing: string[] = [];
    for (const file of [...files(join(root, "src")), ...files(join(root, "app"))]) {
      const source = readFileSync(file, "utf8");
      for (const [cls] of source.matchAll(
        /(?<![\w-])(?:bg|text|border|ring)-[a-z0-9-]+(?:\/\d+)?/g,
      )) {
        const rest = cls.replace(/^[a-z]+-/, "").replace(/\/\d+$/, "");
        const name = names.find((n) => rest === n || rest.startsWith(`${n}-`));
        if (!name) continue; // not a colour (text-center, border-b, ...)
        const value = colors[name] as string | Record<string, string>;
        const shade = rest === name ? "DEFAULT" : rest.slice(name.length + 1);
        if (typeof value === "string" ? shade !== "DEFAULT" : !(shade in value)) {
          missing.push(`${cls} (${file.replace(root, "")})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

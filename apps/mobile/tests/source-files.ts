// The app's own source files (src/ and app/, .ts/.tsx) for the grep guards in the theme tests.

// Plain requires: the app does not take node's type definitions.
const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

declare const __dirname: string;
export const root: string = join(__dirname, "..");

export function files(dir: string): string[] {
  return (readdirSync(dir) as string[]).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every source file in the app. */
export function sourceFiles(): string[] {
  return [...files(join(root, "src")), ...files(join(root, "app"))];
}

export function read(file: string): string {
  return readFileSync(file, "utf8") as string;
}

/** Path relative to the app root, for failure messages. */
export function relative(file: string): string {
  return file.replace(`${root}/`, "");
}

// Copies the shared brand assets (packages/brand/assets) into public/brand so Next serves them
// at /brand/*. Idempotent: the destination is rebuilt on every run. public/brand is gitignored.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../../../packages/brand/assets", import.meta.url));
const dest = fileURLToPath(new URL("../public/brand", import.meta.url));

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

import { execSync } from "node:child_process";

/**
 * Local Supabase credentials for e2e runs, read from `supabase status -o json`.
 * The keys stay in memory: never log, print or write them anywhere.
 */
export type LocalSupabase = { url: string; publishableKey: string; secretKey: string };

/** Process-env cache so Playwright workers (which inherit the runner's env) skip the CLI call. */
const CACHE = "JARSO_E2E_LOCAL_SUPABASE";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** Throws unless `url` points at this machine. The e2e suite must never touch hosted Supabase. */
export function assertLocalUrl(url: string): void {
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(`E2E refuses to run against a non-local Supabase host (${hostname}).`);
  }
}

function readStatus(): LocalSupabase | null {
  let output: string;
  try {
    // stderr is dropped and stdout only parsed: the output contains keys.
    output = execSync("pnpm exec supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
    });
  } catch {
    return null; // Not running (or CLI missing). Never surface the error: it may carry stdout.
  }

  const json = output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1);
  let status: Record<string, unknown>;
  try {
    status = JSON.parse(json);
  } catch {
    return null;
  }

  const pick = (...names: string[]) =>
    names.map((name) => status[name]).find((v): v is string => typeof v === "string" && v !== "");
  const url = pick("API_URL");
  const publishableKey = pick("PUBLISHABLE_KEY", "ANON_KEY");
  const secretKey = pick("SECRET_KEY", "SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) return null;

  assertLocalUrl(url);
  return { url, publishableKey, secretKey };
}

/** Local stack credentials, or null when it isn't running. Runs the CLI once per test run. */
export function loadLocalSupabase(): LocalSupabase | null {
  const cached = process.env[CACHE];
  if (cached !== undefined) {
    if (!cached) return null;
    const local = JSON.parse(cached) as LocalSupabase;
    assertLocalUrl(local.url);
    return local;
  }

  const local = readStatus();
  process.env[CACHE] = local ? JSON.stringify(local) : "";
  return local;
}

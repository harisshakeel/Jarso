/**
 * Demo seed (D11, slice 6): one demo family for the Demo 2 script, created idempotently.
 *
 *   DEMO_PARENT_EMAIL=… DEMO_PARENT_PASSWORD=… DEMO_CHILD_PIN=… pnpm db:seed:demo [--yes-hosted]
 *
 * Creates (or reuses) a confirmed parent with a completed profile, their family, two children
 * (Mia and Leo) with the given PIN, a weekly allowance each with its first handover, a savings
 * goal for Mia, a weekly spending limit for Mia and purchases that go over it (so a limit notice
 * is waiting), a purchase for Leo, and finally turns the family's demo clock on. A parent whose
 * family is not already a demo family is refused, so a real family is never made a demo one. History is
 * written before any clock move, as the demo clock needs (moves shift later history).
 *
 * Target: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY
 * from the environment, or, when none is set, the local stack from `supabase status`. Node loads
 * no .env file here, so the hosted project is only reached when its keys are exported on purpose,
 * and even then only with --yes-hosted.
 *
 * A standalone CLI run by Node outside Next.js: it reads process.env itself (documented
 * exception to the env-module rule, docs/conventions.md). Secrets (keys, password, PIN) are never
 * printed. Run it again at any time: existing rows are found and kept.
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Options (pure, unit tested in tests/scripts/seed-demo.test.ts)
// ---------------------------------------------------------------------------

export type SeedArgs = { yesHosted: boolean; help: boolean };

export function parseSeedArgs(argv: readonly string[]): SeedArgs {
  const args: SeedArgs = { yesHosted: false, help: false };
  for (const arg of argv) {
    if (arg === "--yes-hosted") args.yesHosted = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option "${arg}". Run with --help.`);
  }
  return args;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLocalUrl(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

/** Refuses any Supabase that isn't on this machine unless --yes-hosted was passed. */
export function assertSeedTarget(url: string, yesHosted: boolean): void {
  if (isLocalUrl(url) || yesHosted) return;
  throw new Error(
    `Refusing to seed ${new URL(url).hostname}: it isn't local. Pass --yes-hosted to seed it.`,
  );
}

/**
 * The demo clock moves a family's dates and turns auto charge off for it, so the seed only
 * touches a family that is already a demo family. `existing` is the parent's family before the
 * seed runs (null = none, so the seed creates a new one).
 */
export function assertSeedableFamily(existing: { demoClockEnabled: boolean } | null): void {
  if (existing === null || existing.demoClockEnabled) return;
  throw new Error(
    "Refusing to seed: DEMO_PARENT_EMAIL already has a family that is not a demo family. Use an email with no family, or turn demo_clock_enabled on for that family by hand if an earlier seed run stopped halfway.",
  );
}

const inputSchema = z.object({
  DEMO_PARENT_EMAIL: z.email("DEMO_PARENT_EMAIL must be an email address"),
  DEMO_PARENT_PASSWORD: z
    .string("DEMO_PARENT_PASSWORD is required")
    .min(8, "DEMO_PARENT_PASSWORD must be at least 8 characters")
    .max(72, "DEMO_PARENT_PASSWORD must be at most 72 characters"),
  DEMO_CHILD_PIN: z.string("DEMO_CHILD_PIN is required").regex(/^\d{4,6}$/, {
    message: "DEMO_CHILD_PIN must be 4 to 6 numbers",
  }),
});

const targetSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export type SeedTarget = { url: string; publishableKey: string; secretKey: string };
export type SeedInput = { email: string; password: string; pin: string };

const TARGET_KEYS = Object.keys(targetSchema.shape);

/** Who to create. Messages name the variable, never its value. */
export function readSeedInput(env: Record<string, string | undefined>): SeedInput {
  const parsed = inputSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("\n"));
  }
  return {
    email: parsed.data.DEMO_PARENT_EMAIL.toLowerCase(),
    password: parsed.data.DEMO_PARENT_PASSWORD,
    pin: parsed.data.DEMO_CHILD_PIN,
  };
}

/**
 * Where to seed: all three target variables, or none of them (null = the local stack). A partial
 * set is an error, so a half-exported hosted config never falls back to something else silently.
 */
export function readSeedTarget(env: Record<string, string | undefined>): SeedTarget | null {
  const present = TARGET_KEYS.filter((key) => (env[key] ?? "").trim() !== "");
  if (present.length === 0) return null;
  const parsed = targetSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Set all of ${TARGET_KEYS.join(", ")}, or none to seed the local stack.`);
  }
  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: parsed.data.SUPABASE_SECRET_KEY,
  };
}

const HELP = `Seeds one demo family with its demo clock on.

  DEMO_PARENT_EMAIL=… DEMO_PARENT_PASSWORD=… DEMO_CHILD_PIN=… pnpm db:seed:demo [--yes-hosted]

Seeds the local stack (supabase status) unless NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are set; a non-local URL also
needs --yes-hosted. Safe to run again.
`;

// ---------------------------------------------------------------------------
// The family
// ---------------------------------------------------------------------------

const FAMILY = { currency: "GBP", timezone: "Europe/London" } as const;

type Purchase = { key: string; amount: number; label: string; category: string };
type ChildPlan = {
  nickname: string;
  allowance: number;
  /** The first handover's split: cash to Spend, kept in Save. */
  split: { cash: number; saved: number };
  spendLimitWeek?: number;
  goal?: { name: string; emoji: string; target: number; plan: number };
  purchases: Purchase[];
};

/** Mia's two purchases (370) go over her 300 weekly limit, so a limit notice is waiting. */
const CHILDREN: ChildPlan[] = [
  {
    nickname: "Mia",
    allowance: 600,
    split: { cash: 400, saved: 200 },
    spendLimitWeek: 300,
    goal: { name: "Football boots", emoji: "⚽", target: 4500, plan: 200 },
    purchases: [
      { key: "comic", amount: 120, label: "Comic", category: "other" },
      { key: "cinema-snacks", amount: 250, label: "Cinema snacks", category: "snacks" },
    ],
  },
  {
    nickname: "Leo",
    allowance: 400,
    split: { cash: 300, saved: 100 },
    purchases: [{ key: "game-top-up", amount: 150, label: "Game top-up", category: "apps" }],
  },
];

const apiOptions = { auth: { autoRefreshToken: false, persistSession: false } };

/** Synthetic auth email of a child (ADR 0004), as in src/features/family/codes.ts. */
const childEmail = (id: string) => `${id}@child.jarso.invalid`;

const say = (line: string) => process.stdout.write(`${line}\n`);

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data as T;
}

function readLocalStack(): SeedTarget {
  let output: string;
  try {
    // stdout is parsed, never shown: it holds the local keys.
    output = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 60_000,
    });
  } catch {
    throw new Error("Local Supabase is not running (pnpm db:start), and no target is set.");
  }
  const status = JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1));
  const pick = (...names: string[]) =>
    names.map((name) => status[name]).find((v): v is string => typeof v === "string" && v !== "");
  const url = pick("API_URL");
  const publishableKey = pick("PUBLISHABLE_KEY", "ANON_KEY");
  const secretKey = pick("SECRET_KEY", "SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) {
    throw new Error("`supabase status` did not list the API URL and keys.");
  }
  return { url, publishableKey, secretKey };
}

async function findUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Listing users failed: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < perPage) return null;
  }
}

async function ensureParent(admin: SupabaseClient, input: SeedInput): Promise<string> {
  const existing = await findUserId(admin, input.email);
  if (existing) {
    say(`Parent ${input.email}: already there`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: { jarso_role: "parent" },
    user_metadata: { full_name: "Alex Demo" },
  });
  if (error) throw new Error(`Parent creation failed: ${error.message}`);
  say(`Parent ${input.email}: created`);
  return data.user.id;
}

async function signIn(target: SeedTarget, input: SeedInput): Promise<SupabaseClient> {
  const client = createClient(target.url, target.publishableKey, apiOptions);
  const { error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) {
    throw new Error(
      "The demo parent could not sign in. If the account already existed, DEMO_PARENT_PASSWORD must be its password.",
    );
  }
  return client;
}

/** A child's own session, minted the way the app does after the PIN check (generateLink, verifyOtp). */
async function childSession(
  admin: SupabaseClient,
  target: SeedTarget,
  childId: string,
): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: childEmail(childId),
  });
  if (error) throw new Error(`Child session link failed: ${error.message}`);
  const client = createClient(target.url, target.publishableKey, apiOptions);
  const { error: verifyError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) throw new Error(`Child sign-in failed: ${verifyError.message}`);
  return client;
}

type ExistingFamily = { id: string; demoClockEnabled: boolean };

/** The parent's family before the seed touches anything, or null when they have none. */
async function findFamily(admin: SupabaseClient, parentId: string): Promise<ExistingFamily | null> {
  const { data, error } = await admin
    .from("family_members")
    .select("family_id, families(demo_clock_enabled)")
    .eq("profile_id", parentId)
    .eq("role", "parent")
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw new Error(`Family lookup failed: ${error.message}`);
  if (!data) return null;
  const family = data.families as { demo_clock_enabled?: unknown } | null;
  return { id: data.family_id, demoClockEnabled: family?.demo_clock_enabled === true };
}

async function ensureFamily(
  parent: SupabaseClient,
  existing: ExistingFamily | null,
): Promise<string> {
  if (existing) {
    say("Family: already there (a demo family)");
    return existing.id;
  }
  const id = await rpc<string>(parent, "create_family", {
    p_currency: FAMILY.currency,
    p_timezone: FAMILY.timezone,
  });
  say("Family: created");
  return id;
}

async function childrenByNickname(
  admin: SupabaseClient,
  familyId: string,
): Promise<Map<string, string>> {
  const { data: members, error } = await admin
    .from("family_members")
    .select("profile_id")
    .eq("family_id", familyId)
    .eq("role", "child")
    .eq("status", "approved");
  if (error) throw new Error(`Children lookup failed: ${error.message}`);
  const ids = members.map((m) => m.profile_id as string);
  if (ids.length === 0) return new Map();
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, nickname")
    .in("id", ids);
  if (profileError) throw new Error(`Profile lookup failed: ${profileError.message}`);
  return new Map(profiles.map((p) => [p.nickname as string, p.id as string]));
}

async function ensureChild(
  admin: SupabaseClient,
  parent: SupabaseClient,
  familyId: string,
  existing: Map<string, string>,
  nickname: string,
  pin: string,
): Promise<string> {
  const found = existing.get(nickname);
  if (found) {
    say(`${nickname}: already there`);
    return found;
  }
  const id = randomUUID();
  const { error } = await admin.auth.admin.createUser({
    id,
    email: childEmail(id),
    // Nobody knows it: children sign in with their PIN only.
    password: randomBytes(32).toString("hex"),
    email_confirm: true,
    app_metadata: { jarso_role: "child" },
  });
  if (error) throw new Error(`Child creation failed: ${error.message}`);
  const { error: regError } = await parent.rpc("register_child", {
    p_child_id: id,
    p_family_id: familyId,
    p_nickname: nickname,
    p_pin: pin,
    p_consent: true,
  });
  if (regError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(`register_child failed for ${nickname}: ${regError.message}`);
  }
  say(`${nickname}: created`);
  return id;
}

/** A weekly allowance from today, so the first one is due now, then handed over with a split. */
async function ensureAllowance(
  admin: SupabaseClient,
  parent: SupabaseClient,
  familyId: string,
  childId: string,
  plan: ChildPlan,
): Promise<void> {
  const { count, error } = await admin
    .from("allowance_schedules")
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId);
  if (error) throw new Error(`Allowance lookup failed: ${error.message}`);
  if (!count) {
    const today = await rpc<string>(parent, "family_today", { p_family_id: familyId });
    await rpc(parent, "create_allowance", {
      p_child_id: childId,
      p_amount_minor: plan.allowance,
      p_frequency: "weekly",
      p_first_on: today,
    });
  }

  const { data: due, error: dueError } = await admin
    .from("allowance_occurrences")
    .select("id")
    .eq("child_id", childId)
    .eq("status", "due")
    .order("due_on")
    .limit(1);
  if (dueError) throw new Error(`Occurrence lookup failed: ${dueError.message}`);
  const { count: confirmed, error: confirmedError } = await admin
    .from("allowance_occurrences")
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId)
    .eq("status", "confirmed");
  if (confirmedError) throw new Error(`Occurrence lookup failed: ${confirmedError.message}`);
  // Only the first allowance is handed over here; later ones are the demo's to hand over.
  const first = due[0];
  if (confirmed || !first) {
    say(`${plan.nickname}'s allowance: already there`);
    return;
  }
  await rpc(parent, "confirm_handover", {
    p_occurrence_id: first.id,
    p_cash_minor: plan.split.cash,
    p_saved_minor: plan.split.saved,
    p_idempotency_key: `seed-handover:${first.id}`,
  });
  say(`${plan.nickname}'s allowance: set up and first one handed over`);
}

async function seedChildHistory(
  admin: SupabaseClient,
  target: SeedTarget,
  parent: SupabaseClient,
  childId: string,
  plan: ChildPlan,
): Promise<void> {
  // The limit first, so the purchases below are checked against it.
  if (plan.spendLimitWeek) {
    await rpc(parent, "set_money_rule", {
      p_child_id: childId,
      p_kind: "spend_limit",
      p_period: "week",
      p_amount_minor: plan.spendLimitWeek,
    });
  }

  const child = await childSession(admin, target, childId);
  try {
    if (plan.goal) {
      const { count, error } = await admin
        .from("goals")
        .select("id", { count: "exact", head: true })
        .eq("child_id", childId);
      if (error) throw new Error(`Goal lookup failed: ${error.message}`);
      if (!count) {
        await rpc(child, "save_goal", {
          p_name: plan.goal.name,
          p_emoji: plan.goal.emoji,
          p_target_minor: plan.goal.target,
          p_plan_minor: plan.goal.plan,
        });
      }
    }
    // Fixed keys: a re-run returns the original entries instead of spending again.
    for (const purchase of plan.purchases) {
      await rpc(child, "record_purchase", {
        p_child_id: childId,
        p_amount_minor: purchase.amount,
        p_label: purchase.label,
        p_category: purchase.category,
        p_idempotency_key: `seed:${purchase.key}`,
      });
    }
  } finally {
    await child.auth.signOut();
  }
  say(`${plan.nickname}'s rules, goal and purchases: in place`);
}

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2));
  if (args.help) {
    say(HELP);
    return;
  }
  const input = readSeedInput(process.env);
  const target = readSeedTarget(process.env) ?? readLocalStack();
  assertSeedTarget(target.url, args.yesHosted);
  say(`Seeding the demo family on ${new URL(target.url).host}`);

  const admin = createClient(target.url, target.secretKey, apiOptions);
  const parentId = await ensureParent(admin, input);
  // Before anything is written for an existing parent: never turn a real family into a demo one.
  const existingFamily = await findFamily(admin, parentId);
  assertSeedableFamily(existingFamily);
  const parent = await signIn(target, input);
  await rpc(parent, "complete_parent_profile", {
    p_date_of_birth: "1985-06-15",
    p_country: "GB",
    p_gender: "prefer_not_to_say",
  });

  const familyId = await ensureFamily(parent, existingFamily);
  const existing = await childrenByNickname(admin, familyId);
  for (const plan of CHILDREN) {
    const childId = await ensureChild(admin, parent, familyId, existing, plan.nickname, input.pin);
    await ensureAllowance(admin, parent, familyId, childId, plan);
    await seedChildHistory(admin, target, parent, childId, plan);
  }

  // Last: the clock may only move once the history above is in place.
  const { data: family, error } = await admin
    .from("families")
    .update({ demo_clock_enabled: true })
    .eq("id", familyId)
    .select("code")
    .single();
  if (error) throw new Error(`Turning the demo clock on failed: ${error.message}`);
  await parent.auth.signOut();

  say("");
  say("Demo family ready, demo clock on.");
  say(`  Parent: ${input.email} (password: the DEMO_PARENT_PASSWORD you set)`);
  say(`  Family code: ${family.code}`);
  say(
    `  Children: ${CHILDREN.map((c) => c.nickname).join(", ")} (PIN: the DEMO_CHILD_PIN you set)`,
  );
  say("  The server needs FEATURE_DEMO_CLOCK=true for the Demo clock card in Settings.");
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

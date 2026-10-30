import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  // Optional Resend adapter (D13). Email is skipped unless both are set.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // AI money guide (ADR 0010). Off unless FEATURE_GUIDE is "true" and a provider is ready.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  FEATURE_GUIDE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /** Daily spend cap across all children, in US cents; the guide pauses when it is reached. */
  GUIDE_DAILY_BUDGET_CENTS: z.coerce.number().int().positive().default(1000),
  /** Monthly spend cap across all children, in US cents (calendar month, UTC). */
  GUIDE_MONTHLY_BUDGET_CENTS: z.coerce.number().int().positive().default(10000),
  /** "fake" answers without Claude, for e2e runs; needs GUIDE_ALLOW_FAKE and never on Vercel production. */
  GUIDE_PROVIDER: z.enum(["anthropic", "fake"]).default("anthropic"),
  /** A second, test-only opt-in for the fake provider, so no real host runs it by mistake. */
  GUIDE_ALLOW_FAKE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /** Set by Vercel: "production", "preview" or "development". */
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid server environment variables:\n${z.prettifyError(parsed.error)}`);
}

export const serverEnv = parsed.data;

import type { Route } from "next";
import { z } from "zod";
import { routes } from "@/config";

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});

/** Child accounts use this synthetic domain (family `childEmail`); parents can't sign up with it. */
const CHILD_EMAIL_DOMAIN = "@child.jarso.invalid";

export const signUpSchema = z.object({
  email: z
    .email("Enter a valid email")
    .refine((email) => !email.toLowerCase().endsWith(CHILD_EMAIL_DOMAIN), "Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().min(1, "Name is required").max(100),
  next: z.string().optional(),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Only allow same-origin relative paths as post-login targets (prevents open redirects). */
export function safeNextPath(
  next: string | null | undefined,
  fallback: Route = routes.dashboard,
): Route {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next as Route;
}

/** `path?next=…` when `next` is a safe same-origin path, else just `path`. Keeps `next` across auth pages. */
export function withNext(path: Route, next: string | null | undefined): Route {
  if (!next || safeNextPath(next, path) !== next) return path;
  return `${path}?next=${encodeURIComponent(next)}` as Route;
}

/**
 * Query of the email confirmation link (`/auth/confirm`). Only sign-up confirmation types:
 * recovery and email change would need their own follow-up screens.
 */
export const emailConfirmSchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["email", "signup"]),
  next: z.string().optional(),
});

/**
 * The post-confirmation path carried by an email link. The template sends `{{ .RedirectTo }}`,
 * the absolute `emailRedirectTo` URL (`<app>/auth/callback?next=…`), so that wrapper is unwrapped
 * to its inner `next`. Only URLs on `allowedOrigins` are trusted (blocks open redirects).
 */
export function nextFromEmailLink(
  value: string | null | undefined,
  allowedOrigins: readonly string[],
  fallback: Route = routes.dashboard,
): Route {
  const [base] = allowedOrigins;
  if (!value || !base || !URL.canParse(value, base)) return fallback;
  const url = new URL(value, base);
  if (!allowedOrigins.includes(url.origin)) return fallback;
  const path =
    url.pathname === routes.authCallback
      ? url.searchParams.get("next")
      : `${url.pathname}${url.search}`;
  return safeNextPath(path, fallback);
}

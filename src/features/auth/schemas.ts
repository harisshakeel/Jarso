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

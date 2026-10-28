import type { Route } from "next";
import { z } from "zod";
import { routes } from "@/config";

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().min(1, "Name is required").max(100),
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

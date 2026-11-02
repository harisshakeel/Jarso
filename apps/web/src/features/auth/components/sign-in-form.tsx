"use client";

import { withNext } from "@jarso/core/auth";
import type { Route } from "next";
import Link from "next/link";
import { Field, FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { useOnlineActionState } from "@/features/offline";
import { signIn } from "../server/actions";

/**
 * Creating or opening an account hashes a password and sets cookies on a cold server; under load
 * that can pass the usual 15 s, after which the page would say "taking a while" while the server
 * finished anyway. Auth waits longer before giving up.
 */
const SLOW_AUTH_MS = 45_000;

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending, submit, ready] = useOnlineActionState(signIn, {
    timeoutMs: SLOW_AUTH_MS,
  });
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={formAction} onSubmit={submit} className="grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        errors={fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        errors={fieldErrors?.password}
      />
      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" disabled={pending || !ready}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        No account?{" "}
        <Link
          href={withNext(routes.signup, next) as Route}
          className="underline underline-offset-4"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}

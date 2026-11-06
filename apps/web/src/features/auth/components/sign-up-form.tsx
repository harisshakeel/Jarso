"use client";

import { withNext } from "@jarso/core/auth";
import type { Route } from "next";
import Link from "next/link";
import { Field, FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { useOnlineActionState } from "@/features/offline";
import { signUp } from "../server/actions";

/**
 * Creating or opening an account hashes a password and sets cookies on a cold server; under load
 * that can pass the usual 15 s, after which the page would say "taking a while" while the server
 * finished anyway. Auth waits longer before giving up.
 */
const SLOW_AUTH_MS = 45_000;

/**
 * `placeholder` renders it disabled, for the page to show while the real form (which knows `next`)
 * streams in. React swaps the real form in after the page has loaded, so anything typed into an
 * enabled placeholder would be thrown away and the empty real form sent instead.
 */
export function SignUpForm({ next, placeholder }: { next?: string; placeholder?: boolean }) {
  const [state, formAction, pending, submit, ready] = useOnlineActionState(signUp, {
    timeoutMs: SLOW_AUTH_MS,
  });
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  if (state?.ok && state.data?.needsConfirmation) {
    return <p className="text-sm">Check your inbox to confirm your email, then sign in.</p>;
  }

  return (
    <form action={formAction} onSubmit={submit} className="grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        name="fullName"
        label="Name"
        autoComplete="name"
        required
        disabled={placeholder}
        errors={fieldErrors?.fullName}
      />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        disabled={placeholder}
        errors={fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        disabled={placeholder}
        errors={fieldErrors?.password}
      />
      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" disabled={placeholder || pending || !ready}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href={withNext(routes.login, next) as Route} className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

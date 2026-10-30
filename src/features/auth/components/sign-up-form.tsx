"use client";

import Link from "next/link";
import { Field, FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { useOnlineActionState } from "@/features/offline";
import { withNext } from "../schemas";
import { signUp } from "../server/actions";

export function SignUpForm({ next }: { next?: string }) {
  const [state, , pending, submit] = useOnlineActionState(signUp);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  if (state?.ok && state.data?.needsConfirmation) {
    return <p className="text-sm">Check your inbox to confirm your email, then sign in.</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        name="fullName"
        label="Name"
        autoComplete="name"
        required
        errors={fieldErrors?.fullName}
      />
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
        autoComplete="new-password"
        required
        errors={fieldErrors?.password}
      />
      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href={withNext(routes.login, next)} className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { idle } from "@/lib";
import { withNext } from "../schemas";
import { signIn } from "../server/actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, idle);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
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
      <FormError message={state?.ok === false && !fieldErrors ? state.error.message : undefined} />
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        No account?{" "}
        <Link href={withNext(routes.signup, next)} className="underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </form>
  );
}

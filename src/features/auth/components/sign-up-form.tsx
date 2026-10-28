"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { idle } from "@/lib";
import { signUp } from "../server/actions";
import { Field } from "./field";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, idle);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  if (state?.ok && state.data?.needsConfirmation) {
    return <p className="text-sm">Check your inbox to confirm your email, then sign in.</p>;
  }

  return (
    <form action={action} className="grid gap-4" noValidate>
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
      {state?.ok === false && !fieldErrors ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href={routes.login} className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}

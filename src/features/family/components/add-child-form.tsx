"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FieldError, FormError } from "@/components/form";
import { Button, buttonVariants, Checkbox, Label } from "@/components/ui";
import { routes } from "@/config";
import { idle } from "@/lib";
import { addChildAction } from "../server/actions";

export function AddChildForm() {
  const [state, action, pending] = useActionState(addChildAction, idle);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  const consentErrors = fieldErrors?.consent;

  return (
    <form action={action} className="grid gap-6" noValidate>
      <Field
        name="nickname"
        label="Nickname"
        autoComplete="off"
        maxLength={20}
        required
        description="What your child likes to be called. They type it to sign in."
        errors={fieldErrors?.nickname}
      />
      <Field
        name="pin"
        label="PIN"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="new-password"
        maxLength={6}
        required
        description="4 to 6 numbers. Your child uses it with the family code to sign in."
        errors={fieldErrors?.pin}
      />

      <div className="grid gap-2">
        <Label className="items-start gap-3 font-semibold">
          <Checkbox
            name="consent"
            required
            className="mt-0.5"
            aria-invalid={consentErrors?.length ? true : undefined}
            aria-describedby={consentErrors?.length ? "consent-error" : undefined}
          />
          I am this child's parent or guardian
        </Label>
        <FieldError id="consent-error" errors={consentErrors} />
      </div>

      <FormError message={state?.ok === false && !fieldErrors ? state.error.message : undefined} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={routes.parent} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
        <Button type="submit" size="lg" loading={pending}>
          Add child
        </Button>
      </div>
    </form>
  );
}

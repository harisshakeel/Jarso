"use client";

import { addChildCopy } from "@jarso/core/family";
import Link from "next/link";
import { useState } from "react";
import { Field, FieldError, FormError } from "@/components/form";
import { Button, buttonVariants, Checkbox, Label } from "@/components/ui";
import { routes } from "@/config";
import { useOnlineActionState } from "@/features/offline";
import { addChildAction } from "../server/actions";

export function AddChildForm() {
  const [state, formAction, pending, submit, ready] = useOnlineActionState(addChildAction);
  // Controlled so they survive a failed submit (React resets uncontrolled fields); the PIN clears.
  const [nickname, setNickname] = useState("");
  const [consent, setConsent] = useState(false);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  const consentErrors = fieldErrors?.consent;

  return (
    <form action={formAction} onSubmit={submit} className="grid gap-6" noValidate>
      <Field
        name="nickname"
        label={addChildCopy.nickname}
        autoComplete="off"
        maxLength={20}
        required
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        description={addChildCopy.nicknameHelp}
        errors={fieldErrors?.nickname}
      />
      <Field
        name="pin"
        label={addChildCopy.pin}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={6}
        required
        description={addChildCopy.pinHelp}
        errors={fieldErrors?.pin}
      />

      <div className="grid gap-2">
        <Label className="items-start gap-3 font-semibold">
          <Checkbox
            name="consent"
            required
            checked={consent}
            onCheckedChange={setConsent}
            className="mt-0.5"
            aria-invalid={consentErrors?.length ? true : undefined}
            aria-describedby={consentErrors?.length ? "consent-error" : undefined}
          />
          {addChildCopy.consent}
        </Label>
        <FieldError id="consent-error" errors={consentErrors} />
      </div>

      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={routes.parent} className={buttonVariants({ variant: "outline", size: "lg" })}>
          {addChildCopy.cancel}
        </Link>
        <Button type="submit" size="lg" loading={pending} disabled={!ready}>
          {addChildCopy.submit}
        </Button>
      </div>
    </form>
  );
}

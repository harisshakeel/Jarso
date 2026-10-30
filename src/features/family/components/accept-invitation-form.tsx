"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, FieldError, FormError } from "@/components/form";
import { Button, buttonVariants, Checkbox, Label } from "@/components/ui";
import { routes } from "@/config";
import { useOnlineActionState } from "@/features/offline";
import type { ActionResult, ActionState } from "@/lib";
import { acceptInvitationAction, acceptListedInvitationAction } from "../server/actions";

/** Both accept actions, as this form calls them: always with FormData. */
type SubmitAction = (state: ActionState<never>, payload: FormData) => Promise<ActionResult<never>>;

type AcceptInvitationFormProps = {
  /** Nickname the child chose; the parent can change it. */
  nickname: string;
} & (
  | {
      /** The link token or code the page already resolved; re-checked by the action. */
      invite: string;
      invitationId?: never;
    }
  | {
      /** An invitation from the parent's own list; the action re-checks it is still theirs. */
      invitationId: string;
      invite?: never;
    }
);

/** Parent approves a child-started invitation: nickname, PIN and consent, like Add a child. */
export function AcceptInvitationForm({
  invite,
  invitationId,
  nickname: suggested,
}: AcceptInvitationFormProps) {
  const submit: SubmitAction = invitationId ? acceptListedInvitationAction : acceptInvitationAction;
  const [state, action, pending] = useOnlineActionState(submit);
  // Controlled so they survive a failed submit (React resets uncontrolled fields); the PIN clears.
  const [nickname, setNickname] = useState(suggested);
  const [consent, setConsent] = useState(false);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  const consentErrors = fieldErrors?.consent;

  return (
    <form action={action} className="grid gap-6" noValidate>
      {invitationId ? (
        <input type="hidden" name="invitationId" value={invitationId} />
      ) : (
        <input type="hidden" name="invite" value={invite} />
      )}
      <Field
        name="nickname"
        label="Nickname"
        autoComplete="off"
        maxLength={20}
        required
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        description="Your child picked this. You can change it. They type it to sign in."
        errors={fieldErrors?.nickname}
      />
      <Field
        name="pin"
        label="PIN"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
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
            checked={consent}
            onCheckedChange={setConsent}
            className="mt-0.5"
            aria-invalid={consentErrors?.length ? true : undefined}
            aria-describedby={consentErrors?.length ? "consent-error" : undefined}
          />
          I am this child's parent or guardian
        </Label>
        <FieldError id="consent-error" errors={consentErrors} />
      </div>

      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={routes.parent} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Not now
        </Link>
        <Button type="submit" size="lg" loading={pending}>
          Add child
        </Button>
      </div>
    </form>
  );
}

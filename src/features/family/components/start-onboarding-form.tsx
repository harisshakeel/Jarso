"use client";

import { Field, FormError } from "@/components/form";
import { Button, Card, CardContent } from "@/components/ui";
import { useOnlineActionState } from "@/features/offline";
import { startChildOnboardingAction } from "../server/actions";
import { InviteShareCard } from "./invite-share-card";

/**
 * /start: a signed-out child asks a parent to join. Collects only a nickname and the parent's
 * email (invariant 16), then swaps to the share card with the link and code.
 */
export function StartOnboardingForm() {
  const [state, action, pending] = useOnlineActionState(startChildOnboardingAction);
  if (state?.ok) return <InviteShareCard link={state.data.link} code={state.data.code} />;

  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  return (
    <Card className="rise-in shadow-raised">
      <CardContent>
        <form action={action} className="grid gap-6" noValidate>
          <Field
            name="nickname"
            label="Your nickname"
            autoComplete="nickname"
            maxLength={20}
            required
            description="What should we call you? No need for your real name."
            errors={fieldErrors?.nickname}
          />
          <Field
            name="parentEmail"
            label="Your parent's email"
            type="email"
            autoComplete="off"
            required
            description="We'll send them a link to say yes."
            errors={fieldErrors?.parentEmail}
          />
          <FormError
            message={state?.ok === false && !fieldErrors ? state.error.message : undefined}
            calm={state?.ok === false && state.error.code === "UNAVAILABLE"}
          />
          <Button type="submit" variant="keycap" size="lg" className="w-full" loading={pending}>
            Ask my parent
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { type ActionState, idle } from "@/lib";
import { updateProfileAction } from "../server/actions";
import type { Profile } from "../types";

/** Lets a signed-in user change the name shown on their account. */
export function DisplayNameForm({ fullName }: { fullName: string | null }) {
  const [state, action, pending] = useActionState(
    async (prev: ActionState<Profile>, formData: FormData) => {
      const result = await runOnline(() => updateProfileAction(prev, formData));
      if (result.ok) toast.success("Name saved");
      return result;
    },
    idle,
  );
  // Controlled so a refused save keeps what was typed (React resets uncontrolled fields).
  const [name, setName] = useState(fullName ?? "");
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <Field
        name="fullName"
        label="Your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="name"
        maxLength={100}
        required
        errors={fieldErrors?.fullName}
      />
      <FormError
        message={state?.ok === false && !fieldErrors ? state.error.message : undefined}
        calm={state?.ok === false && state.error.code === "UNAVAILABLE"}
      />
      <Button type="submit" size="lg" loading={pending} className="sm:w-fit">
        Save name
      </Button>
    </form>
  );
}

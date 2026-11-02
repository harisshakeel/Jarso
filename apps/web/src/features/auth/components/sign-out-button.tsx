"use client";

import { FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { useOnlineActionState } from "@/features/offline";
import { signOut } from "../server/actions";

export function SignOutButton() {
  const [state, action, pending] = useOnlineActionState(signOut);
  return (
    <form action={action} className="grid justify-items-end gap-1">
      <Button type="submit" variant="outline" size="lg" loading={pending}>
        Sign out
      </Button>
      <FormError error={state?.ok === false ? state.error : undefined} />
    </form>
  );
}

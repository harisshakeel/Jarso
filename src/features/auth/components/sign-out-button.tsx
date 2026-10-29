"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { idle } from "@/lib";
import { signOut } from "../server/actions";

export function SignOutButton() {
  const [, action, pending] = useActionState(signOut, idle);
  return (
    <form action={action}>
      <Button type="submit" variant="outline" size="lg" loading={pending}>
        Sign out
      </Button>
    </form>
  );
}

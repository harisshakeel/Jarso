"use client";

import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { useOnlineActionState } from "@/features/offline";
import { signOut } from "../server/actions";

/**
 * The header's quiet way out: an icon-only button, named "Log out" so it never collides with the
 * "Sign out" button in Settings. Signing out is a Server Action; while it runs the icon spins.
 */
export function LogOutButton() {
  const [, action, pending] = useOnlineActionState(signOut);
  return (
    <form action={action}>
      <Button type="submit" variant="ghost" size="icon" aria-label="Log out" loading={pending}>
        <LogOutIcon aria-hidden />
      </Button>
    </form>
  );
}

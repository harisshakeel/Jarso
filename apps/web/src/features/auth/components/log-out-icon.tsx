"use client";

import { LogOutIcon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@/components/ui";
import { useOnlineActionState } from "@/features/offline";
import { signOut } from "../server/actions";

/**
 * The header's quiet way out: an icon-only button, named "Log out" so it never collides with the
 * "Sign out" button in Settings. It turns red on hover and asks first, so a stray tap never
 * signs anyone out; signing out is a Server Action, and the button spins while it runs.
 */
export function LogOutButton() {
  const [, action, pending] = useOnlineActionState(signOut);
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Log out"
            className="hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
          />
        }
      >
        <LogOutIcon aria-hidden />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log out?</AlertDialogTitle>
          <AlertDialogDescription>Are you sure you want to log out?</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action}>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Stay
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" size="lg" loading={pending}>
              <LogOutIcon aria-hidden />
              Log out
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

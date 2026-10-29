"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui";
import { SignOutButton } from "@/features/auth";
import { ParentDetailsForm } from "./parent-details-form";

/**
 * Shown over every parent page until the profile is complete (ADR 0008). It cannot be
 * dismissed: Escape and outside clicks are ignored, the page behind is inert, and the server
 * refuses parent actions until the details exist. Signing out is the only other way out. Once
 * the details are saved, refresh() re-renders the shell without this dialog.
 */
export function ProfileCompletionDialog() {
  return (
    <AlertDialog open onOpenChange={() => {}}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Finish your profile</AlertDialogTitle>
          <AlertDialogDescription>
            We need a few details about you before you carry on. Only you can see them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ParentDetailsForm
          submitLabel="Save and continue"
          successMessage="Thanks, you're all set"
        />
        <div className="flex justify-center border-hairline border-t pt-4">
          <SignOutButton />
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

"use client";

import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";

/** Re-renders the page on the server so newly sent invitations show up. */
export function RefreshInvitationsButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      className={className}
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCwIcon aria-hidden />
      Refresh<span className="sr-only"> invitations</span>
    </Button>
  );
}

"use client";

import { CopyIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

type InviteShareCardProps = { link: string; code: string };

/**
 * Shown to the child after /start: the invite link to copy and the code in large type, so a
 * parent can use either. Child voice (design.md §9); "Copy link" is the screen's one keycap.
 */
export function InviteShareCard({ link, code }: InviteShareCardProps) {
  const titleRef = useRef<HTMLDivElement>(null);

  // The form this replaces had focus; move it to the new content for keyboard and screen readers.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast("Couldn't copy. Your parent can type the code instead.");
    }
  }

  return (
    <Card className="rise-in shadow-raised">
      <CardHeader>
        <p className="eyebrow">Nearly there</p>
        <CardTitle ref={titleRef} tabIndex={-1} className="text-h2">
          Show this to your parent.
        </CardTitle>
        <CardDescription className="text-base text-ink-2">
          When they say yes, they'll give you your family code and PIN.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <p className="font-bold">Your code</p>
          <p className="money flex flex-wrap gap-x-3 font-extrabold text-display tracking-[0.1em]">
            <span>{code.slice(0, 4)}</span>
            <span>{code.slice(4)}</span>
          </p>
        </div>
        <div className="grid gap-2">
          <p className="font-bold">Or send them this link</p>
          <p className="break-all rounded-lg bg-muted px-3 py-2 text-ink-2 text-sm">{link}</p>
          <Button variant="keycap" size="lg" className="w-full" onClick={copy}>
            <CopyIcon aria-hidden />
            Copy link
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

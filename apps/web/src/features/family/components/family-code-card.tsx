"use client";

import { CopyIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { toast } from "sonner";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib";

type FamilyCodeCardProps = {
  code: string;
  /** Raised elevation when it is the page's primary card (design.md §4). */
  raised?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** The family's child sign-in code, large and spaced so it's easy to read out or copy. */
export function FamilyCodeCard({ code, raised, className, style }: FamilyCodeCardProps) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Family code copied");
    } catch {
      toast("Couldn't copy. You can type the code instead.");
    }
  }

  return (
    <Card className={cn(raised && "shadow-raised", className)} style={style}>
      <CardHeader>
        <p className="eyebrow">Family code</p>
        <CardTitle>Give this code to your child</CardTitle>
        <CardDescription>
          They sign in with this code, their nickname and their PIN.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <p className="money font-extrabold text-display tracking-[0.2em]">{code}</p>
        <Button variant="outline" onClick={copy}>
          <CopyIcon aria-hidden />
          Copy code
        </Button>
      </CardContent>
    </Card>
  );
}

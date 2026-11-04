"use client";

import { parentGuideCopy } from "@jarso/core/guide";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { routes } from "@/config";
import { runOnline } from "@/features/offline";
import { cn } from "@/lib";
import { setGuideAccessAction } from "../server/actions";

/**
 * The parent's per-child switch for Jarso (spec §5.5, ADR 0011). On by default; a parent can turn
 * it off at any time. While it is on, the child's messages, and the money and learning data Jarso
 * looks up to answer them, go to Anthropic, so the explanation sits right here.
 */
export function GuideSwitch({
  childId,
  nickname,
  enabled,
  detail = "full",
}: {
  childId: string;
  nickname: string;
  enabled: boolean;
  /** "short": one sentence and the link, for the child page; "full": the whole explanation. */
  detail?: "full" | "short";
}) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<{ code: string; message: string } | undefined>();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setError(undefined);
    setOn(next);
    startTransition(async () => {
      const result = await runOnline(() => setGuideAccessAction(null, { childId, enabled: next }));
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
        if (!result.ok) {
          setOn(!next);
          setError(result.error);
        }
      });
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <span id={`guide-switch-${childId}`} className="font-semibold">
          {parentGuideCopy.switchLabel(nickname)}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`guide-switch-${childId}`}
          disabled={pending}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-11 w-[4.75rem] shrink-0 items-center rounded-full border-2 transition-colors disabled:opacity-60",
            on ? "border-primary bg-primary" : "border-hairline-strong bg-muted",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block size-9 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-[2.125rem]" : "translate-x-0.5",
            )}
          />
          <span className="sr-only">{on ? parentGuideCopy.on : parentGuideCopy.off}</span>
        </button>
      </div>
      {detail === "short" ? (
        <p className="text-ink-2">
          {parentGuideCopy.shortBody(nickname)}{" "}
          <Link
            href={routes.safety}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {parentGuideCopy.shortLink}
          </Link>
        </p>
      ) : (
        <p className="text-ink-2">
          {parentGuideCopy.fullBody(nickname)}{" "}
          <Link
            href={routes.safety}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {parentGuideCopy.fullLink}
          </Link>
        </p>
      )}
      <FormError error={error} />
    </div>
  );
}

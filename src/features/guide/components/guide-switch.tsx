"use client";

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
}: {
  childId: string;
  nickname: string;
  enabled: boolean;
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
          Jarso for {nickname}
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
          <span className="sr-only">{on ? "On" : "Off"}</span>
        </button>
      </div>
      <p className="text-ink-2 text-sm">
        Jarso is an AI helper made with Anthropic's Claude. It answers {nickname}'s money questions,
        gives hints in missions, and, when {nickname} asks, looks at their own jars, allowance,
        purchases and learning to answer. It can't see anyone else's money or your planned gifts,
        and it can't move money. It never asks for personal details, never recommends products or
        tells them to buy anything, and points them to help if they seem unsafe. Messages, and what
        Jarso looks up for them, are sent to Anthropic to get answers. Chats are kept here for 30
        days and you can read every one, with what Jarso looked at, except a message that needed a
        safety response, which isn't kept. It's on unless you turn it off, and you can turn it off
        or back on at any time.{" "}
        <Link
          href={routes.safety}
          className="font-semibold text-primary underline underline-offset-4"
        >
          How Jarso keeps children safe
        </Link>
      </p>
      <FormError error={error} />
    </div>
  );
}

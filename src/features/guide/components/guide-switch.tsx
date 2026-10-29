"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib";
import { setGuideAccessAction } from "../server/actions";

/**
 * The parent's per-child switch for the AI guide (spec §5.5). Off by default. Turning it on is
 * the consent for sending the child's messages to Anthropic, so the explanation sits right here.
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setError(null);
    setOn(next);
    startTransition(async () => {
      try {
        const result = await setGuideAccessAction(null, { childId, enabled: next });
        if (!result.ok) {
          setOn(!next);
          setError(result.error.message);
        }
      } catch {
        setOn(!next);
        setError("We couldn't save that. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <span id={`guide-switch-${childId}`} className="font-semibold">
          Money guide for {nickname}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`guide-switch-${childId}`}
          disabled={pending}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 transition-colors disabled:opacity-60",
            on ? "border-primary bg-primary" : "border-hairline-strong bg-muted",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block size-6 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-6" : "translate-x-0.5",
            )}
          />
          <span className="sr-only">{on ? "On" : "Off"}</span>
        </button>
      </div>
      <p className="text-ink-2 text-sm">
        An AI helper made by Anthropic (Claude) that answers {nickname}'s money questions and gives
        hints in missions. It never asks for personal details, never recommends products or tells
        them to buy anything, and points them to help if they seem unsafe. Messages are sent to
        Anthropic to get answers, kept here for 30 days, and you can read every chat. Turning it on
        is your consent to that.
      </p>
      {error ? (
        <p role="alert" className="font-semibold text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

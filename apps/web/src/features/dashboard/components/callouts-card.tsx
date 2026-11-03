import { type Callout, type CalloutAction, noteIdeas, offersNote } from "@jarso/core/dashboard";
import { LightbulbIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { MatchSavingSheet } from "@/features/allowance";
import { SendNoteSheet } from "@/features/notifications";
import { ChildChip } from "./series";

const ACTIONS: Record<CalloutAction, { label: string; href: (childId: string) => Route }> = {
  limit: { label: "Set a spending limit", href: routes.parentRules },
  allowance: { label: "Adjust allowance", href: routes.parentAllowanceEdit },
  goal: { label: "See their goal", href: routes.parentChild },
  chats: { label: "Read the chat", href: routes.parentChildGuide },
};

/**
 * Worth knowing (spec answers 5 and 8): plain observations, each about one child and never
 * comparing children, with the steps a parent might take from it: the page to act on, a note
 * for the child's News (not from a flagged chat, which the parent reads first) and, when their
 * Save grew, matching what they saved.
 */
export function CalloutsCard({
  items,
  currency,
  period,
}: {
  items: Callout[];
  currency: string;
  /** The period in words, "this week", for the match sheet. */
  period: string;
}) {
  return (
    <Card className="shadow-raised">
      <CardContent className="grid gap-3">
        <h2 className="flex items-center gap-2 text-h3">
          <LightbulbIcon aria-hidden className="size-5 text-accent-text" />
          Worth knowing
        </h2>
        {items.length === 0 ? (
          <p className="text-ink-2">Nothing stands out right now.</p>
        ) : (
          <ul className="grid gap-3">
            {items.map((item) => {
              const action = item.action ? ACTIONS[item.action] : null;
              return (
                <li key={item.id} className="grid gap-1.5 rounded-xl bg-muted/60 p-3">
                  <ChildChip nickname={item.nickname} slot={item.slot} />
                  <p>{item.text}</p>
                  <div className="flex flex-wrap items-center gap-x-4">
                    {action ? (
                      <Link
                        href={action.href(item.childId)}
                        className="inline-flex min-h-11 items-center font-semibold text-primary text-sm underline-offset-4 hover:underline"
                      >
                        {action.label} <span className="sr-only">for {item.nickname}</span>
                      </Link>
                    ) : null}
                    {item.matchMinor !== null && item.matchMinor > 0 ? (
                      <MatchSavingSheet
                        childId={item.childId}
                        nickname={item.nickname}
                        currency={currency}
                        amountMinor={item.matchMinor}
                        period={period}
                      />
                    ) : null}
                    {offersNote(item) ? (
                      <SendNoteSheet
                        childId={item.childId}
                        nickname={item.nickname}
                        suggestions={item.action ? noteIdeas[item.action] : []}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

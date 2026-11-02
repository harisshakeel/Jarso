"use client";

import type { AcceptGoalProposalResult, GoalProposal } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import { CircleCheckIcon, TargetIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { runOnline } from "@/features/offline";
import { acceptGoalProposalAction } from "../server/actions";

type CardState =
  | { kind: "offer" }
  | { kind: "has_goal"; existing: string }
  | { kind: "saved"; planKept: boolean }
  | { kind: "dismissed" };

/**
 * The card under a reply in which Jarso offered a goal (demo 3, goal by chat). Jarso never sets
 * a goal: the child decides here, and "Make it my goal" saves it through the goals service. A
 * child who already has a different goal is asked before it is swapped. "Not now" just closes
 * the card; nothing is saved and nothing nags later.
 */
export function ProposalCard({ proposal }: { proposal: GoalProposal }) {
  const copy = guideCopy.proposal;
  const [state, setState] = useState<CardState>({ kind: "offer" });
  const [error, setError] = useState<string | null>(null);
  // A plain flag, not a transition: the card's own buttons are all that wait on the save.
  const [pending, setPending] = useState(false);
  const outcome = useRef<HTMLParagraphElement>(null);

  // The buttons go away once the child has chosen, so focus moves to what happened.
  useEffect(() => {
    if (state.kind === "saved" || state.kind === "has_goal") outcome.current?.focus();
  }, [state.kind]);

  async function save(replace: boolean) {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await runOnline(() =>
        acceptGoalProposalAction(null, {
          title: proposal.title,
          emoji: proposal.emoji,
          priceMinor: proposal.priceMinor,
          saveEachMinor: proposal.saveEachMinor,
          replace,
        }),
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const data: AcceptGoalProposalResult = result.data;
      setState(
        data.status === "saved"
          ? { kind: "saved", planKept: data.planKept }
          : { kind: "has_goal", existing: data.existing },
      );
    } finally {
      setPending(false);
    }
  }

  if (state.kind === "dismissed") return null;

  return (
    <section
      aria-label={copy.title}
      className="grid gap-3 rounded-xl border border-hairline bg-secondary/60 p-3"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-2xl"
        >
          {proposal.emoji}
        </span>
        <div className="grid min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-ink-2 text-sm">
            <TargetIcon aria-hidden className="size-4 shrink-0" />
            {copy.title}
          </p>
          <p className="truncate font-bold">{proposal.title}</p>
          <p className="text-ink-2 text-sm tabular-nums">{proposal.figures}</p>
        </div>
      </div>

      {state.kind === "saved" ? (
        <p
          ref={outcome}
          tabIndex={-1}
          role="status"
          className="flex items-start gap-2 outline-none"
        >
          <CircleCheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>
            {state.planKept ? copy.saved : copy.planLeftOff}{" "}
            <Link
              href={routes.childGoal}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {copy.see}
            </Link>
          </span>
        </p>
      ) : state.kind === "has_goal" ? (
        <div className="grid gap-2">
          <p ref={outcome} tabIndex={-1} className="outline-none">
            {copy.hasGoal(state.existing)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save(true)} loading={pending}>
              {copy.replace}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setState({ kind: "dismissed" })}
              disabled={pending}
            >
              {copy.keep}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(false)} loading={pending}>
            {copy.make}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setState({ kind: "dismissed" })}
            disabled={pending}
          >
            {copy.notNow}
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import type {
  AcceptGoalProposalResult,
  ActionOutcome,
  ActionProposal,
  GoalProposal,
  GuideProposal,
} from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  HourglassIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { runOnline } from "@/features/offline";
import { cn } from "@/lib";
import { acceptGoalProposalAction, confirmActionDraftAction } from "../server/actions";

/**
 * The card under a reply in which Jarso offered something: a goal (`propose_goal`) or an action
 * it prepared (`propose_action`). Jarso never does either: only the user's tap here does, through
 * the app's own form for it, and the card then says what really happened.
 *
 * - `onChange` (actions): "Change something" hands the thread a short line to put in its box.
 * - `onOutcome` (actions): the outcome after "Do it", for the thread to add as Jarso's next line.
 */
export function ProposalCard({
  proposal,
  onChange,
  onOutcome,
}: {
  proposal: GuideProposal;
  onChange?: (text: string) => void;
  onOutcome?: (outcome: ActionOutcome) => void;
}) {
  return proposal.kind === "goal" ? (
    <GoalCard proposal={proposal} />
  ) : (
    <ActionCard proposal={proposal} onChange={onChange} onOutcome={onOutcome} />
  );
}

const OUTCOME_ICON = {
  done: CircleCheckIcon,
  waiting: HourglassIcon,
  declined: CircleAlertIcon,
} as const;

/** An action Jarso prepared: every field in plain words, "Do it" and "Change something". */
function ActionCard({
  proposal,
  onChange,
  onOutcome,
}: {
  proposal: ActionProposal;
  onChange?: (text: string) => void;
  onOutcome?: (outcome: ActionOutcome) => void;
}) {
  const copy = guideCopy.action;
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const line = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (outcome) line.current?.focus();
  }, [outcome]);

  async function doIt() {
    // Once only: the buttons go when there is an outcome, and the draft's id keeps a repeat
    // from recording twice on the server.
    if (pending || outcome) return;
    setPending(true);
    try {
      const result = await runOnline(() =>
        confirmActionDraftAction(null, { draft: proposal.draft }),
      );
      const next: ActionOutcome = result.ok
        ? result.data
        : { status: "declined", text: result.error.message, figures: null };
      setOutcome(next);
      onOutcome?.(next);
    } finally {
      setPending(false);
    }
  }

  const Icon = outcome ? OUTCOME_ICON[outcome.status] : null;
  return (
    <section
      aria-label={proposal.title}
      className="grid gap-3 rounded-xl border border-hairline bg-secondary/60 p-3"
    >
      <div className="grid gap-0.5">
        <p className="flex items-center gap-1.5 font-semibold text-ink-2 text-sm">
          <ClipboardCheckIcon aria-hidden className="size-4 shrink-0" />
          {copy.eyebrow}
        </p>
        <p className="font-bold">{proposal.title}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-card p-3">
        {proposal.lines.map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-ink-2 text-sm">{item.label}</dt>
            <dd className="font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>

      {outcome && Icon ? (
        <div className="grid gap-1">
          <p
            ref={line}
            tabIndex={-1}
            role={outcome.status === "declined" ? "alert" : "status"}
            className="flex items-start gap-2 outline-none"
          >
            <Icon
              aria-hidden
              className={cn(
                "mt-0.5 size-5 shrink-0",
                outcome.status === "declined" ? "text-destructive" : "text-primary",
              )}
            />
            <span>{outcome.text}</span>
          </p>
          {outcome.figures ? (
            <p className="text-ink-2 text-sm tabular-nums">
              Spend {outcome.figures.spend} · Save {outcome.figures.save}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={doIt} loading={pending}>
            {copy.doIt}
          </Button>
          {onChange ? (
            <Button variant="ghost" onClick={() => onChange(copy.changePrompt)} disabled={pending}>
              {copy.change}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

type CardState =
  | { kind: "offer" }
  | { kind: "has_goal"; existing: string }
  | { kind: "saved"; planKept: boolean }
  | { kind: "dismissed" };

/**
 * A goal Jarso offered (goal by chat). Jarso never sets a goal: the child decides here, and
 * "Make it my goal" saves it through the goals service. A child who already has a different goal
 * is asked before it is swapped. "Not now" just closes the card; nothing nags later.
 */
function GoalCard({ proposal }: { proposal: GoalProposal }) {
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

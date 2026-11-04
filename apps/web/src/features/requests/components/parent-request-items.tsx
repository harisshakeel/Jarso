"use client";

import { type ParentRequestItem, parentRequestCopy, requestSentence } from "@jarso/core/requests";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { celebrate } from "@/components/celebrate";
import { FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
} from "@/components/ui";
import { newId, runOnline } from "@/features/offline";
import type { ActionResult } from "@/lib";
import { formatMoney } from "@/lib";
import {
  cancelRequestAction,
  completeRequestAction,
  decideWithdrawalAction,
  rejectDepositAction,
} from "../server/actions";

type ParentRequestItemsProps = { items: ParentRequestItem[]; currency: string };

/**
 * What a parent has to do about money moving in and out of Save, and asks for extra money
 * (FR15). Nothing to show, nothing drawn.
 */
export function ParentRequestItems({ items, currency }: ParentRequestItemsProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="save-requests-title" className="grid gap-3">
      <h2 id="save-requests-title" className="text-h2">
        {parentRequestCopy.title}
      </h2>
      <Card size="sm" className="shadow-raised">
        <ul className="divide-y divide-hairline">
          {items.map((item) => (
            <ParentRequestRow key={item.request.id} item={item} currency={currency} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function ParentRequestRow({ item, currency }: { item: ParentRequestItem; currency: string }) {
  const { nickname, request } = item;
  const router = useRouter();
  const [pending, start] = useTransition();
  // Which button started the running action, so its spinner shows and not its neighbour's.
  const [running, setRunning] = useState<"primary" | "secondary">("primary");
  const [error, setError] = useState<{ code: string; message: string }>();
  // One key for this row's Confirm, made on first tap so server and client markup agree.
  const key = useRef<string | null>(null);
  const sentenceId = useId();
  const amount = formatMoney(request.amountMinor, currency, { showMinor: "always" });

  /** Runs one action, then tells the parent what happened in calm words. */
  function run<T>(
    call: () => Promise<ActionResult<T>>,
    onOk: (data: T) => void,
    button: "primary" | "secondary" = "primary",
  ) {
    setError(undefined);
    setRunning(button);
    start(async () => {
      const result = await runOnline(call);
      start(() => {
        if (!result.ok) {
          setError(result.error);
          // Someone else got there first: show the row as it is now.
          if (result.error.code === "CONFLICT") router.refresh();
          return;
        }
        onOk(result.data);
        router.refresh();
      });
    });
  }

  const decide = (approve: boolean) =>
    run(
      () => decideWithdrawalAction(null, { requestId: request.id, approve }),
      (data) => {
        if (data === "over_available") {
          setError({ code: "CONFLICT", message: parentRequestCopy.overAvailable });
        } else if (data === "already_decided") settled();
        else if (data === "approved")
          celebrate({
            icon: "check",
            title: parentRequestCopy.celebrate.approvedTitle,
            amount,
            body: parentRequestCopy.celebrate.approvedBody(amount, nickname),
          });
        else if (data === "rejected") toast.success(parentRequestCopy.rejected);
      },
      approve ? "primary" : "secondary",
    );

  const settled = () => toast(parentRequestCopy.settled);

  /** Confirms a put-in or a hand-over; the success dialog says what happened. */
  const complete = (done: { title: string; body: string }) => {
    key.current ??= newId();
    const idempotencyKey = key.current;
    run(
      () => completeRequestAction(null, { requestId: request.id, idempotencyKey }),
      (data) => (data === "completed" ? celebrate({ icon: "coins", amount, ...done }) : settled()),
    );
  };

  const cancel = () =>
    run(
      () => cancelRequestAction(null, { requestId: request.id }),
      (data) => (data === "cancelled" ? toast(parentRequestCopy.cancelled) : settled()),
      "secondary",
    );

  const rejectDeposit = () =>
    run(
      () => rejectDepositAction(null, { requestId: request.id }),
      (data) => (data === "rejected" ? toast(parentRequestCopy.depositRejected) : settled()),
      "secondary",
    );

  const sentence = requestSentence(request, nickname, amount);
  let actions: React.ReactNode;
  if (request.kind === "deposit") {
    actions = (
      <>
        <Button
          type="button"
          aria-describedby={sentenceId}
          disabled={pending}
          loading={pending && running === "primary"}
          onClick={() =>
            complete({
              title: parentRequestCopy.celebrate.depositTitle,
              body: parentRequestCopy.celebrate.depositBody(nickname),
            })
          }
        >
          {parentRequestCopy.confirm}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-describedby={sentenceId}
          disabled={pending}
          loading={pending && running === "secondary"}
          onClick={rejectDeposit}
        >
          {parentRequestCopy.didntGetIt}
        </Button>
      </>
    );
  } else if (request.status === "approved") {
    actions = (
      <>
        <Button
          type="button"
          aria-describedby={sentenceId}
          disabled={pending}
          loading={pending && running === "primary"}
          onClick={() =>
            complete({
              title: parentRequestCopy.celebrate.handedOverTitle,
              body: parentRequestCopy.celebrate.handedOverBody(nickname),
            })
          }
        >
          {parentRequestCopy.confirm}
        </Button>
        <DidntHandOver describedBy={sentenceId} disabled={pending} onConfirm={cancel} />
      </>
    );
  } else if (request.kind === "emergency") {
    actions = (
      <>
        <Button
          type="button"
          aria-describedby={sentenceId}
          disabled={pending}
          loading={pending && running === "primary"}
          onClick={() => decide(true)}
        >
          {parentRequestCopy.approve}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-describedby={sentenceId}
          disabled={pending}
          loading={pending && running === "secondary"}
          onClick={() => decide(false)}
        >
          {parentRequestCopy.notNow}
        </Button>
      </>
    );
  } else {
    actions = (
      <>
        <Button
          type="button"
          aria-describedby={sentenceId}
          disabled={pending}
          loading={pending && running === "primary"}
          onClick={() => decide(true)}
        >
          {parentRequestCopy.approve}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-describedby={sentenceId}
          disabled={pending}
          loading={pending && running === "secondary"}
          onClick={() => decide(false)}
        >
          {parentRequestCopy.notNow}
        </Button>
      </>
    );
  }

  return (
    <li className="grid gap-3 px-(--card-spacing) py-3 first:pt-0 last:pb-0">
      <p id={sentenceId} className="font-semibold">
        {sentence}
      </p>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      <FormError error={error} />
    </li>
  );
}

/** A quiet way out of an approved withdrawal, behind a confirm step. */
function DidntHandOver({
  disabled,
  describedBy,
  onConfirm,
}: {
  disabled: boolean;
  describedBy: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            aria-describedby={describedBy}
            disabled={disabled}
          />
        }
      >
        {parentRequestCopy.didntHandOver}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{parentRequestCopy.didntHandOverTitle}</AlertDialogTitle>
          <AlertDialogDescription>{parentRequestCopy.didntHandOverBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{parentRequestCopy.goBack}</AlertDialogCancel>
          <Button
            type="button"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {parentRequestCopy.didntHandOverConfirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

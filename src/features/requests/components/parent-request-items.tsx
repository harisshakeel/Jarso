"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
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
import type { SavingsRequest } from "../types";

export type ParentRequestItem = { nickname: string; request: SavingsRequest };

type ParentRequestItemsProps = { items: ParentRequestItem[]; currency: string };

/** What a parent has to do about money moving in and out of Save. Nothing to show, nothing drawn. */
export function ParentRequestItems({ items, currency }: ParentRequestItemsProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="save-requests-title" className="grid gap-3">
      <h2 id="save-requests-title" className="eyebrow">
        Save requests
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
  const [error, setError] = useState<{ code: string; message: string }>();
  // One key for this row's Confirm, made on first tap so server and client markup agree.
  const key = useRef<string | null>(null);
  const amount = formatMoney(request.amountMinor, currency, { showMinor: "always" });

  /** Runs one action, then tells the parent what happened in calm words. */
  function run<T>(call: () => Promise<ActionResult<T>>, onOk: (data: T) => void) {
    setError(undefined);
    start(async () => {
      const result = await runOnline(call);
      start(() => {
        if (!result.ok) return setError(result.error);
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
          setError({
            code: "CONFLICT",
            message: `There isn't enough in Save for this now.`,
          });
        } else if (data === "already_decided") settled();
        else if (data === "approved") toast.success(`Approved. Hand ${amount} to ${nickname}.`);
        else if (data === "rejected") toast.success("Not now. We let them know.");
      },
    );

  const settled = () => toast("Already sorted.");

  const complete = (done: string, shortOf: "Save" | "Spend") => {
    key.current ??= newId();
    const idempotencyKey = key.current;
    run(
      () => completeRequestAction(null, { requestId: request.id, idempotencyKey }),
      (data) => {
        // The service turns the other outcomes into errors; read them all the same.
        const status: string = data;
        if (status === "completed") toast.success(done);
        else if (status === "already_completed") settled();
        else if (status === "over_available") {
          setError({ code: "CONFLICT", message: `There isn't enough in ${shortOf} for this now.` });
        }
      },
    );
  };

  const cancel = () =>
    run(
      () => cancelRequestAction(null, { requestId: request.id }),
      (data) => (data === "cancelled" ? toast("Okay, left as it was.") : settled()),
    );

  const rejectDeposit = () =>
    run(
      () => rejectDepositAction(null, { requestId: request.id }),
      (data) => (data === "rejected" ? toast("Okay, not added.") : settled()),
    );

  let sentence: string;
  let actions: React.ReactNode;
  if (request.kind === "deposit") {
    sentence = `${nickname} gave you ${amount}?`;
    actions = (
      <>
        <Button type="button" loading={pending} onClick={() => complete("Added to Save.", "Spend")}>
          Confirm
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={rejectDeposit}>
          Didn't get it
        </Button>
      </>
    );
  } else if (request.status === "approved") {
    sentence = `Hand over ${amount} to ${nickname}`;
    actions = (
      <>
        <Button type="button" loading={pending} onClick={() => complete("Handed over.", "Save")}>
          Confirm
        </Button>
        <DidntHandOver disabled={pending} onConfirm={cancel} />
      </>
    );
  } else {
    sentence = `${nickname} wants ${amount}${request.reason ? `: ${request.reason}` : ""}`;
    actions = (
      <>
        <Button type="button" loading={pending} onClick={() => decide(true)}>
          Approve
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => decide(false)}>
          Not now
        </Button>
      </>
    );
  }

  return (
    <li className="grid gap-3 px-(--card-spacing) py-3 first:pt-0 last:pb-0">
      <p className="font-semibold">{sentence}</p>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      <FormError error={error} />
    </li>
  );
}

/** A quiet way out of an approved withdrawal, behind a confirm step. */
function DidntHandOver({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant="ghost" disabled={disabled} />}>
        Didn't hand it over
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Didn't hand it over?</AlertDialogTitle>
          <AlertDialogDescription>
            The money stays in Save and this request closes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <Button
            type="button"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Yes, didn't hand it over
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

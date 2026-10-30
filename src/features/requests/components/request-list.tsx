"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusChip } from "@/components/brand";
import { FormError } from "@/components/form";
import { Button, Card, CardContent } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { formatMoney } from "@/lib";
import { statusLabel } from "../describe";
import { cancelRequestAction } from "../server/actions";
import type { RequestStatus, SavingsRequest } from "../types";

const CHIP = {
  pending: "pending",
  approved: "approved",
  handed_over: "handedOver",
  confirmed: "handedOver",
  rejected: "closed",
  cancelled: "closed",
} as const satisfies Record<RequestStatus, string>;

/** The day in the family's timezone, so the server and the device always agree. */
function day(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(
    new Date(iso),
  );
}

type RequestListProps = { requests: SavingsRequest[]; currency: string; timeZone: string };

/** The child's take-outs and put-ins, newest first. A Waiting one can be cancelled. */
export function RequestList({ requests, currency, timeZone }: RequestListProps) {
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-label="Your requests" className="grid gap-3">
          <h2 className="text-h3">Your requests</h2>
          {requests.length === 0 ? (
            <p className="text-ink-2">Nothing here yet.</p>
          ) : (
            <ul className="grid gap-3">
              {requests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  currency={currency}
                  timeZone={timeZone}
                />
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function RequestRow({
  request,
  currency,
  timeZone,
}: {
  request: SavingsRequest;
  currency: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();
  const what = request.kind === "withdrawal" ? "Take out" : "Put in";
  const amount = formatMoney(request.amountMinor, currency, { showMinor: "nonzero" });

  function cancel() {
    setError(undefined);
    start(async () => {
      const result = await runOnline(() => cancelRequestAction(null, { requestId: request.id }));
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      start(() => {
        if (!result.ok) return setError(result.error);
        if (result.data === "already_closed") toast("This one already moved on.");
        else toast.success("Cancelled");
        router.refresh();
      });
    });
  }

  return (
    <li className="grid gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">
          {what} <span className="money font-bold">{amount}</span>
        </span>
        <StatusChip
          status={CHIP[request.status]}
          label={statusLabel(request.kind, request.status)}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink-2 text-sm">
          {day(request.occurredAt, timeZone)}
          {request.reason ? ` · ${request.reason}` : ""}
        </span>
        {request.status === "pending" ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            aria-label={`Cancel ${what.toLowerCase()} of ${amount}`}
            loading={pending}
            onClick={cancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      <FormError error={error} />
    </li>
  );
}

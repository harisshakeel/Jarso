"use client";

import { HourglassIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, CardContent, Sheet } from "@/components/ui";
import { type OutboxItem, offlineCopy, removeOutboxItem, useOutbox } from "@/features/offline";
import { formatMoney } from "@/lib";
import { purchaseSchema } from "../schemas";
import { type PurchaseDraft, PurchaseSheetContent } from "./purchase-sheet";

const ASK_A_PARENT = "Show this to a parent and decide together.";

type PendingPurchasesProps = { userId: string; currency: string };

/** The form's own strings, as stored in the outbox payload. */
function draftOf(item: OutboxItem): PurchaseDraft {
  const payload = (item.payload ?? {}) as { amount?: unknown; label?: unknown };
  return {
    amount: typeof payload.amount === "string" ? payload.amount : "",
    label: typeof payload.label === "string" ? payload.label : "",
  };
}

/**
 * Purchases saved on this device that the server hasn't taken yet: waiting to send, or refused
 * and needing a look. The Spend jar stays the server's balance; nothing here is taken off it.
 */
export function PendingPurchases({ userId, currency }: PendingPurchasesProps) {
  const router = useRouter();
  const items = useOutbox(userId).filter((item) => item.kind === "purchase");
  const [changing, setChanging] = useState<OutboxItem | null>(null);

  // An item that left the outbox was sent (or removed): show the server's new history and jars.
  const count = items.length;
  const previous = useRef(count);
  useEffect(() => {
    if (count < previous.current) router.refresh();
    previous.current = count;
  }, [count, router]);

  return (
    <>
      {count > 0 ? (
        <Card>
          <CardContent>
            <section aria-label="Not sent yet" className="grid gap-3">
              <h2 className="text-h3">Not sent yet</h2>
              <ul className="grid gap-4">
                {items.map((item) => (
                  <PendingLine
                    key={item.id}
                    item={item}
                    currency={currency}
                    onChange={() => setChanging(item)}
                  />
                ))}
              </ul>
            </section>
          </CardContent>
        </Card>
      ) : null}
      <Sheet open={changing !== null} onOpenChange={(open) => !open && setChanging(null)}>
        {changing ? (
          <PurchaseSheetContent
            currency={currency}
            userId={userId}
            initial={draftOf(changing)}
            // Only once the new one is safely sent or stored does the old one go.
            onSaved={() => removeOutboxItem(changing.id).catch(() => undefined)}
            onDone={() => setChanging(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function PendingLine({
  item,
  currency,
  onChange,
}: {
  item: OutboxItem;
  currency: string;
  onChange: () => void;
}) {
  const [asked, setAsked] = useState(false);
  const parsed = purchaseSchema(currency).safeParse(item.payload);
  const amount = parsed.success
    ? formatMoney(parsed.data.amountMinor, currency, { showMinor: "nonzero" })
    : null;
  const label = (parsed.success && parsed.data.label) || "Purchase";

  return (
    <li className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span>{label}</span>
        {amount ? <span className="money font-bold">−{amount}</span> : null}
      </div>
      {item.status === "needs_look" ? (
        <>
          <p className="text-ink-2 text-sm">{item.message ?? offlineCopy.refused}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onChange}>
              Change it
            </Button>
            <Button variant="outline" onClick={() => setAsked(true)}>
              Ask a parent
            </Button>
            <Button variant="ghost" onClick={() => void removeOutboxItem(item.id).catch(() => {})}>
              Remove
            </Button>
          </div>
          <div role="status">
            {asked ? (
              <p className="rounded-lg bg-muted px-3.5 py-2.5 text-ink-2 text-sm">{ASK_A_PARENT}</p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="flex items-start gap-1.5 text-ink-2 text-sm">
          <HourglassIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {offlineCopy.waiting}
        </p>
      )}
    </li>
  );
}

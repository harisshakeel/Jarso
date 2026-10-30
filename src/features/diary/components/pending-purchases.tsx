"use client";

import { HourglassIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Card, CardContent, Sheet } from "@/components/ui";
import {
  type OutboxItem,
  offlineCopy,
  removeOutboxItem,
  sendToServer,
  showsAsPending,
  useOnline,
  useOutbox,
} from "@/features/offline";
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
  const online = useOnline();
  const stored = useOutbox(userId).filter((item) => item.kind === "purchase");
  // A purchase mid-way through its first online send isn't news: it shows once that has failed.
  const items = stored.filter((item) => showsAsPending(item, online));
  const [changing, setChanging] = useState<OutboxItem | null>(null);

  /**
   * An expired purchase may have reached the server already (a reply lost on the way back), so
   * it is sent once more with its own key first: a replay never records twice. Only a refusal
   * opens the form, which brings a new key. Returns "offline" when that send didn't get through.
   */
  async function resend(item: OutboxItem): Promise<"offline" | undefined> {
    const outcome = await sendToServer(item);
    if (outcome.kind === "done") {
      await removeOutboxItem(item.id).catch(() => undefined);
      toast.success("Saved. Nice one.");
      router.refresh();
      return;
    }
    if (outcome.kind === "refused") {
      setChanging(item);
      return;
    }
    return "offline";
  }

  // An item that left the outbox was sent (or removed): show the server's new history and jars.
  const count = stored.length;
  const previous = useRef(count);
  useEffect(() => {
    if (count < previous.current) router.refresh();
    previous.current = count;
  }, [count, router]);

  return (
    <>
      {items.length > 0 ? (
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
                    onResend={() => resend(item)}
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
  onResend,
}: {
  item: OutboxItem;
  currency: string;
  onChange: () => void;
  /** For an expired item: send it once more before anything is changed. */
  onResend: () => Promise<"offline" | undefined>;
}) {
  const [asked, setAsked] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const [checking, startChecking] = useTransition();
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
            <Button
              variant="outline"
              aria-label={`Change it: ${label}`}
              loading={checking}
              onClick={() => {
                if (item.message !== offlineCopy.expired) return onChange();
                startChecking(async () => {
                  const result = await onResend();
                  startChecking(() => setUnsent(result === "offline"));
                });
              }}
            >
              Change it
            </Button>
            <Button
              variant="outline"
              aria-label={`Ask a parent: ${label}`}
              onClick={() => setAsked(true)}
            >
              Ask a parent
            </Button>
            <Button
              variant="ghost"
              aria-label={`Remove: ${label}`}
              onClick={() => void removeOutboxItem(item.id).catch(() => {})}
            >
              Remove
            </Button>
          </div>
          <div role="status" className="grid gap-2">
            {unsent ? (
              <p className="rounded-lg bg-muted px-3.5 py-2.5 text-ink-2 text-sm">
                {offlineCopy.offline}
              </p>
            ) : null}
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

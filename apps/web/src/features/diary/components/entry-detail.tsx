"use client";

import type { EntryVersion } from "@jarso/core/diary";
import {
  earlierVersions,
  entryDetailCopy,
  notEnoughSaveMessage,
  notEnoughSpendToUndoMessage,
  undoneReceivedMessage,
  undoneSpendMessage,
} from "@jarso/core/diary";
import { ChevronRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { CategoryIcon, categoryOf, type HistoryItem } from "@/features/ledger";
import { runOnline } from "@/features/offline";
import { formatMoney } from "@/lib";
import { listEntryVersionsAction, undoDiaryEntryAction } from "../server/actions";
import { FixForm } from "./fix-form";

/**
 * A diary line, opened: fix it, take it back, or look at what it said before. Fixes and Undo
 * need a connection. The child's own lines only; parents never see this.
 */
export function EntryDetail({ item, currency }: { item: HistoryItem; currency: string }) {
  const [open, setOpen] = useState(false);
  const kind = item.kind === "received" ? "received" : "purchase";
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          // Stretched link: the ::after covers the whole row (the <li> is `relative`), so tapping
          // the line, or its "Fixed · was" note, opens this sheet.
          <Button
            variant="ghost"
            size="icon"
            aria-label={entryDetailCopy.detailsFor(item.label)}
            className="after:absolute after:inset-0 after:content-['']"
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        }
      />
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            <span className="inline-flex items-center gap-2">
              <CategoryIcon category={item.category} kind={kind} className="size-5" />
              {item.label}
            </span>
          </SheetTitle>
          <SheetDescription>
            {item.amountMinor === null
              ? ""
              : formatMoney(item.amountMinor, currency, { showMinor: "nonzero" })}
          </SheetDescription>
        </SheetHeader>
        {/* Inside the sheet, so it unmounts on close: each open starts fresh. */}
        <Detail item={item} currency={currency} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function Detail({
  item,
  currency,
  onDone,
}: {
  item: HistoryItem;
  currency: string;
  onDone: () => void;
}) {
  const [fixing, setFixing] = useState(false);
  if (fixing) {
    return (
      <div className="px-4 pb-4 sm:px-6 sm:pb-6">
        <FixForm item={item} currency={currency} onDone={onDone} />
      </div>
    );
  }
  return (
    <div className="grid gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="flex flex-wrap gap-2">
        {item.canFix ? (
          <Button type="button" size="lg" onClick={() => setFixing(true)}>
            {entryDetailCopy.fix}
          </Button>
        ) : null}
        {item.canUndo && item.entryId ? <UndoControl item={item} onDone={onDone} /> : null}
      </div>
      {item.entryId ? <EarlierVersions item={item} currency={currency} /> : null}
    </div>
  );
}

function UndoControl({ item, onDone }: { item: HistoryItem; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  function undo() {
    setError(undefined);
    start(async () => {
      const result = await runOnline(() =>
        undoDiaryEntryAction(null, { entryId: item.entryId ?? "" }),
      );
      // After an await, updates leave the transition unless wrapped again.
      start(() => {
        if (!result.ok) return setError(result.error.message);
        switch (result.data) {
          case "not_enough_spend":
            return setError(notEnoughSpendToUndoMessage);
          case "not_enough_save":
            return setError(notEnoughSaveMessage);
          default:
            toast.success(item.kind === "received" ? undoneReceivedMessage : undoneSpendMessage);
            onDone();
            router.refresh();
        }
      });
    });
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" size="lg" loading={pending} onClick={undo}>
        {entryDetailCopy.undo}
      </Button>
      <FormError message={error} />
    </div>
  );
}

function EarlierVersions({ item, currency }: { item: HistoryItem; currency: string }) {
  const [versions, setVersions] = useState<EntryVersion[]>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  // A fixed line opens with its earlier versions showing: tapping the "Fixed · was" note lands here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on open
  useEffect(() => {
    if (item.fixedFrom) load();
  }, []);

  function load() {
    setError(undefined);
    start(async () => {
      const result = await runOnline(() =>
        listEntryVersionsAction(null, { entryId: item.entryId ?? "" }),
      );
      start(() => {
        if (!result.ok) return setError(result.error.message);
        // Newest first, so the oldest version is last; the current line is not "earlier".
        setVersions(earlierVersions(result.data, item.entryId ?? ""));
      });
    });
  }

  const kind = item.kind === "received" ? "received" : "purchase";
  return (
    <div className="grid gap-2">
      {versions ? (
        versions.length === 0 ? (
          <p className="text-ink-2">{entryDetailCopy.noEarlierVersions}</p>
        ) : (
          <ul className="grid gap-1" aria-label={entryDetailCopy.earlierVersions}>
            {versions.map((v) => (
              <li key={v.id} data-testid="earlier-version" className="text-ink-2">
                <span className="money font-semibold">
                  {formatMoney(v.amountMinor, currency, { showMinor: "nonzero" })}
                </span>
                {" · "}
                {categoryOf(v.category, kind).label}
                {v.label ? ` · ${v.label}` : ""}
              </li>
            ))}
          </ul>
        )
      ) : (
        <Button type="button" variant="ghost" loading={pending} onClick={load}>
          {entryDetailCopy.earlierVersions}
        </Button>
      )}
      <FormError message={error} />
    </div>
  );
}

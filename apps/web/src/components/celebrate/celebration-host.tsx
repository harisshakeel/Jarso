"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  CircleCheckIcon,
  CoinsIcon,
  GiftIcon,
  SendIcon,
  SparkleIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui";
import { cn, playCoins, playRight } from "@/lib";
import {
  type Celebration,
  currentCelebration,
  dismissCelebration,
  type QueuedCelebration,
  subscribeCelebrations,
} from "./celebrate";

const icons: Record<NonNullable<Celebration["icon"]>, typeof CircleCheckIcon> = {
  check: CircleCheckIcon,
  gift: GiftIcon,
  coins: CoinsIcon,
  send: SendIcon,
  target: TargetIcon,
};

/**
 * The success dialog, mounted once in the app's providers (design.md §6). A centred card over
 * a soft scrim: a green ring closes around the badge, the amount (if any) in large type, the
 * title, one line on what happens next, and one green "Done" keycap; an optional quiet link
 * under it. Coins ring for money, a bell otherwise (the Sounds switch applies). Escape, the
 * scrim and Done all close it. Motion stops under reduced motion.
 */
export function CelebrationHost() {
  const current = useSyncExternalStore(subscribeCelebrations, currentCelebration, () => null);
  // Keep the last one on screen while the card animates out, so it never flashes empty.
  const [shown, setShown] = useState<QueuedCelebration | null>(null);

  useEffect(() => {
    if (!current) return;
    setShown(current);
    if (current.icon === "coins" || current.icon === "gift") playCoins();
    else playRight();
  }, [current]);

  const Icon = icons[shown?.icon ?? "check"];

  return (
    <Dialog.Root
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) dismissCelebration();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25 transition-opacity duration-250 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup
          data-slot="celebration"
          className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-sm justify-items-center gap-4 rounded-3xl bg-card px-6 pt-8 pb-6 text-center text-card-foreground shadow-raised outline-none transition duration-250 ease-brand data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
        >
          {shown ? (
            <div key={shown.seq} className="grid w-full justify-items-center gap-4">
              <SuccessBadge icon={Icon} />
              {shown.amount ? (
                <p className="money font-extrabold text-4xl text-success-text">{shown.amount}</p>
              ) : null}
              <div className="grid gap-1.5">
                <Dialog.Title className="text-balance text-h2">{shown.title}</Dialog.Title>
                {shown.body ? (
                  <Dialog.Description className="text-balance text-ink-2">
                    {shown.body}
                  </Dialog.Description>
                ) : null}
              </div>
              <div className="grid w-full gap-1 pt-1">
                <Dialog.Close
                  render={<Button variant="keycap-success" size="xl" className="w-full" />}
                >
                  {shown.doneLabel ?? "Done"}
                </Dialog.Close>
                {shown.action ? (
                  <Link
                    href={shown.action.href}
                    onClick={() => dismissCelebration()}
                    className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
                  >
                    {shown.action.label}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A green ring that closes around the picture, with two gold sparkles. */
function SuccessBadge({ icon: Icon }: { icon: typeof CircleCheckIcon }) {
  return (
    <div className="relative grid size-24 place-items-center rounded-full bg-success-soft">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          className="stroke-success motion-safe:animate-[ring-close_600ms_var(--ease-brand)_both]"
        />
      </svg>
      <Icon
        aria-hidden
        className="size-11 text-success-text motion-safe:animate-[badge-in_600ms_var(--ease-brand)_both]"
      />
      <SparkleIcon
        aria-hidden
        className="absolute -top-1 -right-1 size-6 fill-gold text-gold motion-safe:animate-[buddy-twinkle_2.4s_ease-in-out_infinite]"
      />
      <SparkleIcon
        aria-hidden
        className="absolute bottom-0 -left-2 size-4 fill-gold text-gold motion-safe:animate-[buddy-twinkle_2.4s_ease-in-out_1.2s_infinite]"
      />
    </div>
  );
}

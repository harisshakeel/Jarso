"use client";

import { type CoinFlight, flightFor, jarCapacity } from "@jarso/core/ledger";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { JarIllustration } from "@/components/jar";
import { routes } from "@/config";
import { GoalSheet, type GoalView } from "@/features/goals";
import {
  type Availability,
  PutInSheet,
  type SavingsRequest,
  TakeOutSheet,
  takeOutLimit,
} from "@/features/requests";
import { describeRuleForChild, type MoneyRule } from "@/features/rules";
import { cn, formatMoney, playCoins } from "@/lib";

type JarShelfProps = {
  currency: string;
  userId: string;
  availability: Availability;
  /** The child's money rules; the ones about Save are listed in the sheets. */
  rules: MoneyRule[];
  goal: GoalView;
  allowanceMinor: number | null;
  /** Allowance money due but not handed over yet. Never inside a jar. */
  dueMinor: number;
  /** Pending and approved requests, shown under the jar they affect. */
  openRequests: SavingsRequest[];
  /** The parent set jar moves to "just tell me": the trays say the move happens at once. */
  movesWithoutAsking?: boolean;
  /** A move that just landed, for the coins to fly once on first paint (a sheet can pass it). */
  justMoved?: CoinFlight | null;
};

/** A request in the child's words, under its jar (spec §6.1). */
function requestChip(request: SavingsRequest, money: (minor: number) => string): string {
  const amount = money(request.amountMinor);
  if (request.kind === "deposit") return `${amount} to Save · give it to your parent`;
  if (request.kind === "emergency") {
    return request.status === "approved"
      ? `${amount} extra · your parent said yes`
      : `${amount} extra asked · waiting for your parent`;
  }
  return request.status === "approved"
    ? `${amount} from Save · your parent said yes`
    : `${amount} asked from Save · waiting for your parent`;
}

type Jar = "spend" | "save";

/**
 * Child Home's two jars (FR03, FR02): Spend and Save side by side. The resting shelf is just the
 * jars and their balances; tapping a jar opens its tray of actions, so one tap at a time has one
 * meaning. The goal lives in its own card (GoalCard); here the Save jar is a plain jar on the
 * shared scale, and due money floats outside the jars. Every amount is also in text.
 */
export function JarShelf({
  currency,
  userId: _userId,
  availability,
  rules,
  goal,
  allowanceMinor,
  dueMinor,
  openRequests,
  movesWithoutAsking = false,
  justMoved = null,
}: JarShelfProps) {
  const [open, setOpen] = useState<Jar | null>(null);
  const trayId = useId();
  const { spendMinor, saveMinor, reservedSaveMinor } = availability;
  // Coins fly when the balances the shelf shows change (design.md §8): Save to Spend, Spend to
  // Save, or out of Spend for a purchase. The first paint flies nothing unless told to.
  const previous = useRef({ spend: spendMinor, save: saveMinor });
  const [flight, setFlight] = useState<{ key: number; flight: CoinFlight } | null>(() =>
    justMoved ? { key: 0, flight: justMoved } : null,
  );
  useEffect(() => {
    const next = { spend: spendMinor, save: saveMinor };
    const found = flightFor(previous.current, next);
    previous.current = next;
    if (found) setFlight({ key: Date.now(), flight: found });
  }, [spendMinor, saveMinor]);
  useEffect(() => {
    if (!flight) return;
    playCoins();
    const done = setTimeout(() => setFlight(null), FLIGHT_MS + 200);
    return () => clearTimeout(done);
  }, [flight]);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const ruleLines = (kinds: MoneyRule["kind"][]) => [
    ...(movesWithoutAsking
      ? ["You can move money between your jars without asking. Your parent gets a note."]
      : []),
    ...rules
      .filter((rule) => kinds.includes(rule.kind))
      .map((r) => describeRuleForChild(r, currency)),
  ];

  // FR05: with an unreached goal, the Save sheets ask the child to predict the effect first.
  const predict =
    goal && !goal.progress.reached
      ? { goal: goal.goal, saveMinor, reservedMinor: reservedSaveMinor }
      : undefined;
  const countedMinor = Math.max(saveMinor - reservedSaveMinor, 0);
  const shared = jarCapacity({ spendMinor, saveMinor, allowanceMinor, currency });
  // Deposits and emergencies touch Spend; withdrawals touch Save.
  const spendSide = openRequests.filter((r) => r.kind !== "withdrawal");
  const withdrawals = openRequests.filter((r) => r.kind === "withdrawal");
  const toggle = (jar: Jar) => setOpen((current) => (current === jar ? null : jar));

  return (
    <section aria-label="Your jars" className="grid gap-4">
      {dueMinor > 0 ? (
        <p className="justify-self-center rounded-full border border-cyan-700 border-dashed px-3 py-1 font-semibold text-cyan-700 dark:border-cyan-300 dark:text-cyan-300">
          {money(dueMinor)} on its way · waiting for a parent
        </p>
      ) : null}
      <div className="@container relative grid grid-cols-2 gap-4">
        {flight ? <CoinFlightOverlay key={flight.key} flight={flight.flight} /> : null}
        <section aria-label="Spend jar" data-tour="spend" className="grid content-start gap-2">
          <JarButton
            jar="spend"
            name="Spend"
            amount={money(spendMinor)}
            caption="Cash you have"
            open={open === "spend"}
            controls={`${trayId}-spend`}
            onToggle={() => toggle("spend")}
          >
            <JarIllustration
              jar="spend"
              size="shelf"
              capacityMinor={shared}
              filledMinor={spendMinor}
            />
          </JarButton>
          {spendSide.map((r) => (
            <p key={r.id} className="text-center text-ink-2">
              {requestChip(r, money)}
            </p>
          ))}
          <Tray id={`${trayId}-spend`} open={open === "spend"}>
            <PutInSheet
              currency={currency}
              availableSpendMinor={availability.availableSpendMinor}
              ruleLines={ruleLines(["deposit_auto_confirm"])}
              predict={predict}
              trigger={{ label: "Put some in Save" }}
            />
            <Link
              href={routes.childDiary}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-2 font-semibold text-primary underline-offset-4 hover:underline"
            >
              See my diary
            </Link>
          </Tray>
        </section>
        <section aria-label="Save jar" data-tour="save" className="grid content-start gap-2">
          <JarButton
            jar="save"
            name="Save"
            amount={money(saveMinor)}
            caption="Kept by your parent"
            open={open === "save"}
            controls={`${trayId}-save`}
            onToggle={() => toggle("save")}
          >
            <JarIllustration
              jar="save"
              size="shelf"
              capacityMinor={shared}
              filledMinor={countedMinor}
              reservedMinor={reservedSaveMinor}
            />
          </JarButton>
          {withdrawals.map((r) => (
            <p key={r.id} className="text-center text-ink-2">
              {requestChip(r, money)}
            </p>
          ))}
          <Tray id={`${trayId}-save`} open={open === "save"}>
            <TakeOutSheet
              currency={currency}
              limitMinor={takeOutLimit(availability)}
              ruleLines={ruleLines(["withdrawal_cap", "withdrawal_auto_approve"])}
              predict={predict}
              trigger={{ label: "Take some out" }}
            />
            <GoalSheet
              goal={goal?.goal ?? null}
              currency={currency}
              allowanceMinor={allowanceMinor}
              saveMinor={saveMinor}
              reservedMinor={reservedSaveMinor}
            />
            <Link
              href={routes.childRequests}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-2 font-semibold text-primary underline-offset-4 hover:underline"
            >
              Move my money
            </Link>
          </Tray>
        </section>
      </div>
      <Legend reserved={reservedSaveMinor > 0} due={dueMinor > 0} />
    </section>
  );
}

/** How long the coins are in the air. */
const FLIGHT_MS = 700;

/**
 * Three coins arcing from one jar to the other, or up and away out of Spend, over the shelf.
 * Decorative: the balances say what happened. Motion-safe only; reduced motion shows nothing.
 */
function CoinFlightOverlay({ flight }: { flight: CoinFlight }) {
  const out = flight.to === "out";
  const fromLeft = flight.from === "spend";
  const dx = out ? "0px" : fromLeft ? "50cqw" : "-50cqw";
  return (
    <div
      aria-hidden
      data-coin-flight={`${flight.from}-${flight.to}`}
      className="pointer-events-none absolute inset-0 z-10 hidden motion-safe:block"
    >
      {[0, 1, 2].map((coin) => (
        <span
          key={coin}
          className="absolute top-[42%] size-5 rounded-full border-2 border-teal-800 bg-gold shadow-raised motion-safe:animate-[coin-fly_700ms_var(--ease-brand)_both]"
          style={
            {
              left: fromLeft ? "25%" : "75%",
              marginLeft: `${(coin - 1) * 10}px`,
              animationDelay: `${coin * 70}ms`,
              "--fly-dx": dx,
              "--fly-dy": out ? "-110px" : "0px",
              "--fly-end": out ? 0 : 1,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** The jar itself is the button: picture, name, balance, caption, and a small chevron. */
function JarButton({
  jar,
  name,
  amount,
  caption,
  open,
  controls,
  onToggle,
  children,
}: {
  jar: Jar;
  name: string;
  amount: string;
  caption: string;
  open: boolean;
  controls: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "grid w-full justify-items-center gap-2 rounded-2xl p-2 text-center transition-colors",
        "hover:bg-card active:scale-[0.98] motion-safe:transition-transform",
        open && "bg-card shadow-raised",
      )}
    >
      {children}
      <span
        className={cn(
          "flex items-center gap-1 font-bold text-h3",
          jar === "spend" ? "text-primary" : "text-gold-text",
        )}
      >
        {name}
        <ChevronDownIcon
          aria-hidden
          className={cn("size-5 transition-transform", open && "rotate-180")}
        />
      </span>
      <span className="money font-extrabold text-money-l">{amount}</span>
      <span className="text-ink-2">{caption}</span>
    </button>
  );
}

/** The actions for one jar, shown once the jar is tapped. */
function Tray({ id, open, children }: { id: string; open: boolean; children: React.ReactNode }) {
  if (!open) return <div id={id} hidden />;
  // A tray is half the shelf, about 150 px on a 360 px phone: its buttons wrap onto two lines
  // ("Put some in Save") instead of spilling into the other jar. Still at least 44 px tall.
  return (
    <div
      id={id}
      className="rise-in grid w-full gap-2 pt-1 [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal [&_button]:py-2 [&_button]:text-center [&_button]:leading-tight"
    >
      {children}
    </div>
  );
}

/** Only the keys the drawing is using right now. */
function Legend({ reserved, due }: { reserved: boolean; due: boolean }) {
  if (!reserved && !due) return null;
  return (
    <ul
      aria-label="What the jars show"
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-ink-2"
    >
      {reserved ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm bg-[repeating-linear-gradient(45deg,var(--color-gold-400)_0_3px,transparent_3px_8px)]"
          />
          Waiting to come out
        </li>
      ) : null}
      {due ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-full border border-cyan-700 border-dashed dark:border-cyan-300"
          />
          On its way
        </li>
      ) : null}
    </ul>
  );
}

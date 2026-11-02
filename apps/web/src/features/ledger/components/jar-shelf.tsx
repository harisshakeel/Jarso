"use client";

import { jarCapacity } from "@jarso/core/ledger";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
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
import { cn, formatMoney } from "@/lib";

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
 * meaning. With a goal, a full Save jar means the goal is reached; due money floats outside the
 * jars. Every amount is also in text.
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
}: JarShelfProps) {
  const [open, setOpen] = useState<Jar | null>(null);
  const trayId = useId();
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const ruleLines = (kinds: MoneyRule["kind"][]) =>
    rules.filter((rule) => kinds.includes(rule.kind)).map((r) => describeRuleForChild(r, currency));

  const { spendMinor, saveMinor, reservedSaveMinor } = availability;
  // FR05: with an unreached goal, the Save sheets ask the child to predict the effect first.
  const predict =
    goal && !goal.progress.reached
      ? { goal: goal.goal, saveMinor, reservedMinor: reservedSaveMinor }
      : undefined;
  const countedMinor = Math.max(saveMinor - reservedSaveMinor, 0);
  const shared = jarCapacity({ spendMinor, saveMinor, allowanceMinor, currency });
  const saveCapacity = goal ? goal.goal.targetMinor : shared;
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
      <div className="grid grid-cols-2 gap-4">
        <section aria-label="Spend jar" className="grid content-start gap-2">
          <JarButton
            jar="spend"
            name="Spend"
            amount={money(spendMinor)}
            caption="Cash you have"
            open={open === "spend"}
            controls={`${trayId}-spend`}
            onToggle={() => toggle("spend")}
          >
            <JarIllustration jar="spend" capacityMinor={shared} filledMinor={spendMinor} />
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
        <section aria-label="Save jar" className="grid content-start gap-2">
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
              capacityMinor={saveCapacity}
              filledMinor={countedMinor}
              reservedMinor={reservedSaveMinor}
              goal={goal ? { emoji: goal.goal.emoji } : null}
            />
          </JarButton>
          {goal ? <GoalLines goal={goal} money={money} reservedMinor={reservedSaveMinor} /> : null}
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
      <Legend goal={goal !== null} reserved={reservedSaveMinor > 0} due={dueMinor > 0} />
    </section>
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
  return (
    <div id={id} className="rise-in grid w-full gap-2 pt-1">
      {children}
    </div>
  );
}

/** Only the keys the drawing is using right now; a child with no goal never reads about one. */
function Legend({ goal, reserved, due }: { goal: boolean; reserved: boolean; due: boolean }) {
  if (!goal && !reserved && !due) return null;
  return (
    <ul
      aria-label="What the jars show"
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-ink-2"
    >
      {goal ? (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-gold" />
          Counts toward your goal
        </li>
      ) : null}
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

function GoalLines({
  goal: { goal, progress },
  money,
  reservedMinor,
}: {
  goal: NonNullable<GoalView>;
  money: (minor: number) => string;
  reservedMinor: number;
}) {
  return (
    <div className="grid gap-1 text-center">
      <p className="font-semibold">
        {goal.emoji} {goal.name}, {money(goal.targetMinor)}.
      </p>
      {/* With money waiting to come out, Save and "to go" don't add up unless we say this. */}
      {reservedMinor > 0 && !progress.reached ? (
        <p>{money(progress.countedMinor)} counts toward it</p>
      ) : null}
      {progress.reached ? (
        <p className="font-bold">Goal reached</p>
      ) : progress.paymentsLeft === null ? (
        <>
          <p>{money(progress.remainingMinor)} to go</p>
          <p className="text-ink-2">
            Set how much you'll save each time to see how long it'll take
          </p>
        </>
      ) : (
        <p>
          {money(progress.remainingMinor)} to go · about {progress.paymentsLeft} more{" "}
          {progress.paymentsLeft === 1 ? "allowance" : "allowances"} at {money(goal.planMinor ?? 0)}{" "}
          each
        </p>
      )}
    </div>
  );
}

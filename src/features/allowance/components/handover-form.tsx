"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, FieldError, FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  Slider,
} from "@/components/ui";
import { routes } from "@/config";
import { type ActionState, formatMoney, idle, parseMoney } from "@/lib";
import { formatDay, toMajorString } from "../describe";
import { confirmHandoverAction, markNotGivenAction } from "../server/actions";
import type { HandoverResult, Split } from "../types";

type HandoverFormProps = {
  kind: "allowance" | "gift";
  id: string;
  childId: string;
  nickname: string;
  currency: string;
  amountMinor: number;
  /** `YYYY-MM-DD`. */
  dueOn: string;
  note: string | null;
  /** Starting split in minor units (last time's share applied to this amount). */
  prefill: Split;
};

const MONEY_ERROR = "Enter an amount like 5 or 5.50.";

/** Parent confirmation: how the due money was split into cash (Spend) and kept (Save). Spec §5.2. */
export function HandoverForm({
  kind,
  id,
  childId,
  nickname,
  currency,
  amountMinor,
  dueOn,
  note,
  prefill,
}: HandoverFormProps) {
  const router = useRouter();
  const isAllowance = kind === "allowance";
  // Made on the client after mount so server and client markup agree; one key per form mount.
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => setIdempotencyKey(crypto.randomUUID()), []);

  const [state, action, pending] = useActionState(
    async (_prev: ActionState<HandoverResult>, formData: FormData) => {
      const result = await confirmHandoverAction(null, formData);
      if (result.ok) {
        toast.success(
          result.data === "confirmed" ? `Handed over to ${nickname}.` : "Already handled.",
        );
        router.push(routes.parentAllowance(childId));
      }
      return result;
    },
    idle,
  );

  const [cash, setCash] = useState(toMajorString(prefill.cash, currency));
  const [saved, setSaved] = useState(toMajorString(prefill.saved, currency));
  const cashMinor = parseMoney(cash, currency);
  const savedMinor = parseMoney(saved, currency);
  const valid = cashMinor !== null && savedMinor !== null;
  const total = valid ? cashMinor + savedMinor : 0;
  const short = isAllowance && valid && total > 0 && total < amountMinor ? amountMinor - total : 0;
  const over = isAllowance && valid && total > amountMinor;

  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  const cashError = cash.trim() && cashMinor === null ? MONEY_ERROR : fieldErrors?.cash?.[0];
  const savedError = saved.trim() && savedMinor === null ? MONEY_ERROR : fieldErrors?.saved?.[0];
  const totalError = over
    ? `That's more than ${formatMoney(amountMinor, currency)}, which was due.`
    : undefined;

  function setShare(percent: number) {
    const share = Math.round((amountMinor * percent) / 100);
    setSaved(toMajorString(share, currency));
    setCash(toMajorString(amountMinor - share, currency));
  }

  function typeSaved(value: string) {
    setSaved(value);
    const minor = parseMoney(value, currency);
    // Spend takes the rest of what was due, so the parent only types one number.
    if (minor !== null && minor <= amountMinor)
      setCash(toMajorString(amountMinor - minor, currency));
  }

  const barBase = Math.max(amountMinor, total);
  const spendWidth = valid && barBase > 0 ? (cashMinor / barBase) * 100 : 0;
  const saveWidth = valid && barBase > 0 ? (savedMinor / barBase) * 100 : 0;
  const sliderValue =
    valid && amountMinor > 0 ? Math.min(100, Math.round((savedMinor / amountMinor) * 100)) : 0;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <Card className="rise-in shadow-raised">
        <CardContent className="grid gap-1">
          <div className="flex items-center gap-2">
            <p className="flex-1 font-bold">
              {isAllowance ? "Allowance" : "Gift"} · Due {formatDay(dueOn)}
            </p>
            <Badge variant="count">Due</Badge>
          </div>
          {note ? <p className="text-ink-2">{note}</p> : null}
          <p className="money font-extrabold text-3xl">{formatMoney(amountMinor, currency)}</p>
        </CardContent>
      </Card>

      <Card className="rise-in">
        <CardContent className="grid gap-6">
          <div
            aria-hidden
            className="flex h-4 overflow-hidden rounded-full bg-muted"
            data-testid="split-bar"
          >
            <div className="bg-teal-600 transition-[width]" style={{ width: `${spendWidth}%` }} />
            <div className="bg-gold-300 transition-[width]" style={{ width: `${saveWidth}%` }} />
          </div>
          <Slider
            aria-label={`Save share of ${formatMoney(amountMinor, currency)}`}
            min={0}
            max={100}
            step={5}
            value={[sliderValue]}
            onValueChange={(value) => setShare(Array.isArray(value) ? (value[0] ?? 0) : value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field
              name="cash"
              label={`Spend (cash to ${nickname})`}
              inputMode="decimal"
              autoComplete="off"
              value={cash}
              onChange={(event) => setCash(event.target.value)}
              errors={cashError ? [cashError] : undefined}
            />
            <Field
              name="saved"
              label="Save (you keep)"
              inputMode="decimal"
              autoComplete="off"
              value={saved}
              onChange={(event) => typeSaved(event.target.value)}
              errors={savedError ? [savedError] : undefined}
            />
          </div>
          <p className="text-ink-2 text-sm">Same split as last time. Drag or type to change.</p>
          <FieldError errors={totalError ? [totalError] : undefined} />
          {short > 0 ? (
            <p role="status" className="text-ink-2 text-sm">
              <span className="money font-bold">{formatMoney(short, currency)}</span> will be noted
              as short
            </p>
          ) : null}
          {isAllowance ? (
            <p className="text-ink-2 text-sm">
              Gave less? Enter what you gave. The rest is noted as short.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <FormError message={state?.ok === false && !fieldErrors ? state.error.message : undefined} />
      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={!idempotencyKey || !valid || over}
        >
          Confirm I handed it over
        </Button>
        {isAllowance ? <NotGivenButton id={id} childId={childId} nickname={nickname} /> : null}
        <Link
          href={routes.parentAllowance(childId)}
          className={buttonVariants({ variant: "ghost", size: "lg" })}
        >
          Back
        </Link>
      </div>
    </form>
  );
}

function NotGivenButton({
  id,
  childId,
  nickname,
}: {
  id: string;
  childId: string;
  nickname: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  function confirm() {
    setError(undefined);
    start(async () => {
      const result = await markNotGivenAction(null, { id });
      if (result.ok) {
        toast.success(result.data === "closed" ? "Marked as not given." : "Already handled.");
        router.push(routes.parentAllowance(childId));
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant="outline" size="lg" />}>
        Mark as not given
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as not given?</AlertDialogTitle>
          <AlertDialogDescription>
            {nickname} won't get this one, and it won't be paid later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <Button variant="destructive" loading={pending} onClick={confirm}>
            Mark as not given
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

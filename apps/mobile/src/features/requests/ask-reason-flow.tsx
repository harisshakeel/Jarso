import { quickChips } from "@jarso/core/home";
import {
  type AskStatusOf,
  askCelebration,
  askFlowCopy,
  askReasons,
  reasonText,
} from "@jarso/core/requests";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { z } from "zod";
import type { CelebrationChip } from "@/components/celebrate";
import { HomeWait, Notice, useSendOnce } from "@/components/sheet";
import { Button, Input, Text } from "@/components/ui";
import {
  AmountKeypad,
  FlowShell,
  PictureGrid,
  SentCelebration,
  useSparkChips,
} from "@/features/flows";
import { JarsoGuess, useGoal } from "@/features/goals";
import { useHome } from "@/features/jars";
import { useParentLabel } from "@/features/progress";
import { actionErrorMessage, formatMoney, parseMoney } from "@/lib";

const REASON_LABEL = "What's it for?";

type Payload = { amountMinor: number; reason: string; idempotencyKey: string };
type FieldErrors = { amount?: string[]; reason?: string[] };

type AskReasonFlowProps<R extends { status: string }> = {
  kind: "withdrawal" | "emergency";
  onClose: () => void;
  /** The request mutation (unchanged hook): it sends the payload and says how it went. */
  send: { mutateAsync: (payload: Payload) => Promise<R>; isPending: boolean };
  /** The same schema the web form uses; its messages are the ones shown. */
  schema: (currency: string) => z.ZodType<{
    amountMinor: number;
    reason?: string;
    idempotencyKey: string;
  }>;
  /** The message when the server refused (over_available, over_cap); null when it was sent. */
  refusal: (result: R, currency: string) => string | null;
  /** The most the child can ask for, shown as one chip; null when nothing limits it. */
  limitMinor: (home: NonNullable<ReturnType<typeof useHome>["data"]>) => number | null;
  /** Jarso's closer/further guess on the amount screen (Use savings only). */
  guess: boolean;
};

/**
 * Two screens for "Use savings" and "Ask for extra": how much (keypad), then "For what?" (picture
 * grid, Other opens one text line), then a celebration. Mount it once per opening: the
 * idempotency key is made on mount and reused by every retry.
 */
export function AskReasonFlow<R extends { status: string }>({
  kind,
  onClose,
  send,
  schema,
  refusal,
  limitMinor,
  guess,
}: AskReasonFlowProps<R>) {
  const home = useHome();
  const goal = useGoal();
  const parent = useParentLabel();
  const router = useRouter();
  const [idempotencyKey] = useState(() => randomUUID());
  const [step, setStep] = useState<1 | 2>(1);
  const [amount, setAmount] = useState("");
  const [reasonKey, setReasonKey] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [notice, setNotice] = useState<string>();
  const [sent, setSent] = useState<{ status: string; chips: CelebrationChip[] }>();
  const once = useSendOnce();
  const sparks = useSparkChips();
  const currency = home.data?.context.currency;
  if (!home.data || !currency) return <HomeWait error={home.error} onClose={onClose} />;

  const flow = askFlowCopy(parent);
  const copy = flow[kind];
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const amountMinor = parseMoney(amount, currency);
  const limit = limitMinor(home.data);
  const activeGoal = kind === "withdrawal" && goal.data ? goal.data.goal : null;
  const options = askReasons(kind, activeGoal);
  const unreached = goal.data && !goal.data.progress.reached ? goal.data : null;

  function fail(errors: FieldErrors) {
    setFieldErrors(errors);
    if (errors.amount) setStep(1);
  }

  function next() {
    // A stand-in reason: this step only checks the amount, with the web's message.
    const parsed = schema(currency as string).safeParse({ amount, reason: "x", idempotencyKey });
    if (!parsed.success) {
      return setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
    }
    setFieldErrors(undefined);
    setNotice(undefined);
    setStep(2);
  }

  function submit() {
    return once(async () => {
      setNotice(undefined);
      const reason = reasonText(reasonKey ?? "", options, typed, activeGoal);
      const parsed = schema(currency as string).safeParse({ amount, reason, idempotencyKey });
      if (!parsed.success) return fail(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      setFieldErrors(undefined);
      let result: R;
      try {
        sparks.snapshot();
        result = await send.mutateAsync({
          amountMinor: parsed.data.amountMinor,
          reason: parsed.data.reason ?? "",
          idempotencyKey: parsed.data.idempotencyKey,
        });
      } catch (error) {
        return setNotice(await actionErrorMessage(error));
      }
      const refused = refusal(result, currency as string);
      if (refused) {
        // The amount is what to change: back to the keypad with the message.
        setStep(1);
        return setNotice(refused);
      }
      setSent({ status: result.status, chips: await sparks.chips() });
    });
  }

  if (sent) {
    const message = askCelebration(
      kind,
      sent.status as AskStatusOf[typeof kind],
      money(amountMinor ?? 0),
      parent,
    );
    return (
      <SentCelebration
        celebration={{
          title: message.title,
          subtitle: message.subtitle,
          tone: "teal",
          chips: sent.chips,
          primary: { label: "Nice", onPress: onClose },
          secondary: message.tracked
            ? { label: "Track it", onPress: () => router.replace("/(child)/requests") }
            : undefined,
        }}
      />
    );
  }

  if (step === 1) {
    return (
      <FlowShell
        title={copy.title}
        step={1}
        steps={2}
        onClose={onClose}
        footer={
          <Button variant="keycap" size="lg" accessibilityLabel="Next" onPress={next}>
            <Text>Next</Text>
          </Button>
        }
      >
        <AmountKeypad
          value={amount}
          onChange={(value) => {
            setAmount(value);
            setFieldErrors(undefined);
          }}
          currency={currency}
          chips={quickChips(currency, limit)}
          limit={
            kind === "withdrawal" && limit !== null
              ? flow.withdrawal.limit(money(limit))
              : undefined
          }
          error={fieldErrors?.amount?.[0]}
        />
        {guess && unreached ? (
          <JarsoGuess
            move="take_out"
            amountMinor={amountMinor}
            goal={unreached.goal}
            saveMinor={home.data.availability.saveMinor}
            reservedMinor={home.data.availability.reservedSaveMinor}
          />
        ) : null}
        <Notice message={notice} />
      </FlowShell>
    );
  }

  const reasonError = fieldErrors?.reason?.[0];
  return (
    <FlowShell
      title={copy.forWhat}
      step={2}
      steps={2}
      onBack={() => setStep(1)}
      onClose={onClose}
      footer={
        <Button
          variant={kind === "emergency" ? "keycap-grape" : "keycap"}
          size="lg"
          accessibilityLabel={copy.button}
          accessibilityState={{ busy: send.isPending, disabled: !reasonKey || send.isPending }}
          disabled={!reasonKey || send.isPending}
          onPress={() => void submit()}
        >
          {send.isPending ? <ActivityIndicator color="white" /> : <Text>{copy.button}</Text>}
        </Button>
      }
    >
      <PictureGrid
        options={options}
        value={reasonKey}
        onChange={setReasonKey}
        legend={copy.forWhat}
      />
      {reasonKey === "other" ? (
        <Input
          accessibilityLabel={REASON_LABEL}
          aria-invalid={Boolean(reasonError)}
          value={typed}
          onChangeText={setTyped}
          placeholder={kind === "emergency" ? flow.emergency.otherHint : undefined}
          autoComplete="off"
          maxLength={140}
        />
      ) : null}
      {reasonError ? (
        <Text accessibilityLiveRegion="polite" className="text-primary">
          {reasonError}
        </Text>
      ) : null}
      <Notice message={notice} />
    </FlowShell>
  );
}

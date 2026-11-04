import {
  type AutoChargeCard,
  type AutoChargeTarget,
  type PaymentProviderId,
  paymentCopy,
} from "@jarso/core/payments";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Switch, View } from "react-native";
import { Card, CardSeparator } from "@/components/screen";
import { Notice } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { Field, useSession } from "@/features/auth";
import { actionErrorMessage, isAppError } from "@/lib";
import { keys } from "@/lib/query";
import { setAutoCharge } from "./api";
import { BottomSheet, SegmentedChoice } from "./bottom-sheet";
import { presentSheet, type SheetOutcome, useFakeSheet } from "./sheets";
import {
  type AutoChargeSlotTarget,
  toAutoChargeTarget,
  useAutoChargeState,
} from "./use-auto-charge-state";
import { usePaymentProviders } from "./use-payment-providers";

export type AutoChargeSlotProps = { target: AutoChargeSlotTarget };

/** After the save-card sheet, how long and how often to look for the webhook's switch-on. */
const WAIT_MS = 20_000;
const WAIT_STEP_MS = 2_000;

/**
 * Auto charge for a schedule or gift (mockups H, I), the web's `AutoChargeToggle`. Turning on
 * with one saved card uses it; with several the parent picks; with none, Jarso's sheet shows
 * the mandate (and the provider choice, and the mobile number a provider needs) before the
 * provider's own save-card sheet. The switch turns on only when the server says so (the
 * provider's webhook saves the card). Renders nothing when no provider has a native sheet.
 */
export function AutoChargeSlot({ target }: AutoChargeSlotProps) {
  const { userId } = useSession();
  const state = useAutoChargeState(target);
  const providers = usePaymentProviders();
  const cards = providers.data?.cards;
  if (!cards || cards.length === 0 || !state.data) return null;
  return (
    <AutoChargeBlock
      target={toAutoChargeTarget(target)}
      on={state.data.on}
      provider={state.data.provider}
      mine={state.data.by === userId}
      overdue={state.data.overdue}
      cards={cards}
      refetch={state.refetch}
    />
  );
}

type Question = { kind: "choose"; options: AutoChargeCard[] } | { kind: "save" };

function AutoChargeBlock({
  target,
  on,
  provider,
  mine,
  overdue,
  cards,
  refetch,
}: {
  target: AutoChargeTarget;
  on: boolean;
  provider: PaymentProviderId | null;
  mine: boolean;
  overdue: boolean;
  cards: AutoChargeCard[];
  refetch: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const fake = useFakeSheet();
  const usable = cards.filter((card) => card.unavailableReason === null);
  const blocked = overdue || usable.length === 0;

  const [checked, setChecked] = useState(on);
  // Follow a new `on` from the server (a refetch after the webhook, or another parent).
  const [shownOn, setShownOn] = useState(on);
  const [question, setQuestion] = useState<Question | null>(null);
  const [saveWith, setSaveWith] = useState<PaymentProviderId | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneErrors, setPhoneErrors] = useState<string[]>();
  const [sheetError, setSheetError] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [later, setLater] = useState(false);

  if (on !== shownOn) {
    setShownOn(on);
    setChecked(on);
    if (on) {
      setWaitingSince(null);
      setLater(false);
    }
  }

  // The provider's sheet said it finished: the webhook saves the card and turns this on.
  useEffect(() => {
    if (waitingSince === null) return;
    const timer = setInterval(() => {
      if (Date.now() - waitingSince >= WAIT_MS) {
        setWaitingSince(null);
        setChecked(false);
        setLater(true);
        return;
      }
      void refetch();
    }, WAIT_STEP_MS);
    return () => clearInterval(timer);
  }, [waitingSince, refetch]);

  if (blocked && !on) {
    return (
      <Card>
        <Text className="font-sans-bold">{paymentCopy.autoCharge}</Text>
        <Text className="text-muted-foreground">
          {overdue ? paymentCopy.autoChargeOverdue : paymentCopy.unsupportedCurrency}
        </Text>
      </Card>
    );
  }

  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.payments() });

  /** Turns on with `using` (its saved card, or saving one there first), or turns off. */
  async function save(next: boolean, using?: PaymentProviderId, contact?: string) {
    if (pending) return;
    setPending(true);
    setError(undefined);
    setSheetError(undefined);
    setPhoneErrors(undefined);
    setLater(false);
    // Whether Jarso's sheet is open for this request: its errors are shown inside it.
    const asking = question !== null;
    try {
      let result: Awaited<ReturnType<typeof setAutoCharge>>;
      try {
        result = await setAutoCharge(
          next
            ? { ...target, on: true, provider: using, ...(contact ? { phone: contact } : {}) }
            : { ...target, on: false },
        );
      } catch (cause) {
        const fieldPhone = isAppError(cause) ? cause.fieldErrors?.phone : undefined;
        if (asking && fieldPhone) {
          setPhoneErrors(fieldPhone);
        } else if (asking) {
          setSheetError(await actionErrorMessage(cause));
        } else {
          setChecked(on);
          setError(await actionErrorMessage(cause));
        }
        return;
      }
      // Jarso's sheet is done; anything after this shows under the switch.
      setQuestion(null);
      if (result.setup) {
        let outcome: SheetOutcome;
        try {
          outcome = await presentSheet(result.setup.sheet, { onFake: fake.open });
        } catch (cause) {
          setChecked(on);
          setError(await actionErrorMessage(cause));
          return;
        }
        if (outcome === "completed") setWaitingSince(Date.now());
        else setChecked(on);
      }
      refresh();
    } finally {
      setPending(false);
    }
  }

  function toggle(next: boolean) {
    if (pending || waitingSince !== null) return;
    // On but no longer allowed (an overdue gift): it can only be turned off.
    if (next && blocked) return;
    if (!next) {
      setChecked(false);
      void save(false);
      return;
    }
    const savedCards = usable.filter((card) => card.card !== null);
    const [only] = savedCards;
    if (only && savedCards.length === 1) {
      setChecked(true);
      void save(true, only.provider);
      return;
    }
    setError(undefined);
    setSheetError(undefined);
    setPhoneErrors(undefined);
    setPhone("");
    setSaveWith(usable[0]?.provider ?? null);
    setQuestion(savedCards.length > 1 ? { kind: "choose", options: savedCards } : { kind: "save" });
  }

  // While on, name the card it charges (the parent's own) or only its provider (another's).
  const current = cards.find((card) => card.provider === provider);
  const named =
    on && current
      ? mine && current.card
        ? paymentCopy.charges(
            cards.length > 1
              ? paymentCopy.cardAt(
                  paymentCopy.cardEnding(current.card.brand, current.card.last4),
                  current.label,
                )
              : paymentCopy.cardEnding(current.card.brand, current.card.last4),
          )
        : paymentCopy.chargesOther(current.label)
      : null;

  const detail =
    target.type === "allowance_schedule"
      ? paymentCopy.autoChargeAllowance
      : paymentCopy.autoChargeGift;
  const chosen = usable.find((card) => card.provider === saveWith) ?? usable[0];

  return (
    <Card>
      {fake.element}
      <View className="min-h-12 flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="font-sans-bold">{paymentCopy.autoCharge}</Text>
          <Text className="text-muted-foreground">{detail}</Text>
        </View>
        {pending || waitingSince !== null ? <ActivityIndicator /> : null}
        <Switch
          testID="auto-charge-switch"
          accessibilityRole="switch"
          accessibilityLabel={paymentCopy.autoCharge}
          accessibilityHint={detail}
          value={checked}
          disabled={pending || waitingSince !== null}
          onValueChange={toggle}
        />
      </View>
      {named ? (
        <>
          <CardSeparator />
          <Text>{named}</Text>
        </>
      ) : null}
      {later ? <Text accessibilityLiveRegion="polite">{paymentCopy.autoChargeLater}</Text> : null}
      <Notice message={error} />
      <Text className="text-muted-foreground text-small">{paymentCopy.testMode}</Text>

      {question?.kind === "choose" ? (
        <BottomSheet
          title={paymentCopy.chooseCardTitle}
          detail={paymentCopy.chooseCardDetail}
          busy={pending}
          onClose={() => {
            setQuestion(null);
            setChecked(on);
          }}
        >
          {question.options.map((option) => {
            const label = option.card
              ? paymentCopy.cardAt(
                  paymentCopy.cardEnding(option.card.brand, option.card.last4),
                  option.label,
                )
              : option.label;
            return (
              <Button
                key={option.provider}
                variant="outline"
                accessibilityLabel={label}
                accessibilityState={{ disabled: pending }}
                disabled={pending}
                onPress={() => {
                  setChecked(true);
                  void save(true, option.provider);
                }}
              >
                <Text>{label}</Text>
              </Button>
            );
          })}
          <Notice message={sheetError} />
          <NotNow
            pending={pending}
            onPress={() => {
              setQuestion(null);
              setChecked(on);
            }}
          />
        </BottomSheet>
      ) : null}

      {question?.kind === "save" && chosen ? (
        <BottomSheet
          title={paymentCopy.saveCardTitle}
          detail={paymentCopy.mandate}
          busy={pending}
          onClose={() => setQuestion(null)}
        >
          {usable.length > 1 ? (
            <SegmentedChoice
              options={usable.map((card) => ({ value: card.provider, label: card.label }))}
              value={chosen.provider}
              disabled={pending}
              onChange={(next) => {
                setSaveWith(next);
                setPhoneErrors(undefined);
              }}
            />
          ) : null}
          {chosen.needsPhone ? (
            <Field
              label={paymentCopy.phoneLabel}
              description={paymentCopy.phoneHelp(chosen.label)}
              value={phone}
              onChangeText={(value) => {
                setPhone(value);
                setPhoneErrors(undefined);
              }}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              editable={!pending}
              errors={phoneErrors}
            />
          ) : null}
          <Notice message={sheetError} />
          <Button
            accessibilityLabel={paymentCopy.saveWith(chosen.label)}
            accessibilityState={{ busy: pending, disabled: pending }}
            disabled={pending}
            onPress={() =>
              void save(true, chosen.provider, chosen.needsPhone ? phone.trim() : undefined)
            }
          >
            {pending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text>{paymentCopy.saveWith(chosen.label)}</Text>
            )}
          </Button>
          <NotNow pending={pending} onPress={() => setQuestion(null)} />
        </BottomSheet>
      ) : null}
    </Card>
  );
}

function NotNow({ pending, onPress }: { pending: boolean; onPress: () => void }) {
  return (
    <Button
      variant="link"
      accessibilityLabel={paymentCopy.notNow}
      accessibilityState={{ disabled: pending }}
      disabled={pending}
      onPress={onPress}
    >
      <Text>{paymentCopy.notNow}</Text>
    </Button>
  );
}

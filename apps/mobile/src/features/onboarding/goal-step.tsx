import {
  type GoalView,
  goalInputSchema,
  goalProgress,
  toGoLine,
  weeksToGoal,
} from "@jarso/core/goals";
import { ONBOARDING_GOALS, onboardingCopy, suggestedPlan } from "@jarso/core/onboarding";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { z } from "zod";
import { Notice } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { AmountKeypad } from "@/features/flows";
import {
  GoalRing,
  useAllowance,
  useAllowanceSave,
  useGoal,
  useSaveGoal,
  useSavingPace,
} from "@/features/goals";
import { useHome } from "@/features/jars";
import { actionErrorMessage, cn, formatMoney, isAppError, parseMoney, toMajorString } from "@/lib";
import { OnboardingFrame } from "./onboarding-frame";

type GoalStepProps = { onNext: () => void; onSkip: () => void };
type Pick = (typeof ONBOARDING_GOALS)[number];

const copy = onboardingCopy.goal;

/**
 * Pick a real goal (saved through `save_goal`, like the goal sheet) and see "about N weeks". An
 * existing goal is shown and kept, never replaced. Not now moves on without a goal.
 */
export function GoalStep({ onNext, onSkip }: GoalStepProps) {
  const home = useHome();
  const goal = useGoal();
  const currency = home.data?.context.currency;

  if (!currency || goal.data === undefined) {
    const failed = Boolean(home.error ?? goal.error);
    return (
      <OnboardingFrame step="goal" onSkip={onSkip} footer={<NotNow onPress={onNext} />}>
        {failed ? null : (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator accessibilityLabel="Loading" />
          </View>
        )}
      </OnboardingFrame>
    );
  }
  const counted = Math.max(
    (home.data?.availability.saveMinor ?? 0) - (home.data?.availability.reservedSaveMinor ?? 0),
    0,
  );
  if (goal.data) {
    return <KeepGoal view={goal.data} currency={currency} onNext={onNext} onSkip={onSkip} />;
  }
  return <NewGoal currency={currency} countedMinor={counted} onNext={onNext} onSkip={onSkip} />;
}

function NotNow({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="ghost" onPress={onPress}>
      <Text>{copy.notNow}</Text>
    </Button>
  );
}

function Heading({ sub }: { sub?: string }) {
  return (
    <View className="gap-1">
      <Text accessibilityRole="header" className="font-sans-extrabold text-h1">
        {copy.heading}
      </Text>
      {sub ? <Text className="text-muted-foreground">{sub}</Text> : null}
    </View>
  );
}

function KeepGoal({
  view,
  currency,
  onNext,
  onSkip,
}: {
  view: NonNullable<GoalView>;
  currency: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const pace = useSavingPace();
  const { goal, progress } = view;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const line = toGoLine(
    progress,
    weeksToGoal({
      remainingMinor: progress.remainingMinor,
      planMinor: goal.planMinor,
      frequency: pace.frequency,
    }),
    money,
  );
  return (
    <OnboardingFrame
      step="goal"
      onSkip={onSkip}
      footer={
        <Button variant="keycap" size="lg" onPress={onNext}>
          <Text>{copy.keep}</Text>
        </Button>
      }
    >
      <Heading />
      <View className="items-center gap-3 rounded-3xl bg-card p-6">
        <Text className="font-sans-bold text-muted-foreground">{copy.yours}</Text>
        <GoalRing emoji={goal.emoji} value={progress.fillRatio} size={140} />
        <Text className="font-sans-extrabold text-h2">{`${goal.emoji} ${goal.name}`}</Text>
        {line ? <Text className="text-muted-foreground">{line}</Text> : null}
      </View>
    </OnboardingFrame>
  );
}

function NewGoal({
  currency,
  countedMinor,
  onNext,
  onSkip,
}: {
  currency: string;
  countedMinor: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [picked, setPicked] = useState<Pick | null>(null);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const allowance = useAllowance();
  const allowanceSave = useAllowanceSave();
  const pace = useSavingPace();
  const save = useSaveGoal();
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });

  const targetMinor = parseMoney(target, currency);
  const plan = suggestedPlan(allowance.data ?? null, currency, allowanceSave.data ?? null);
  const weeks =
    targetMinor && plan
      ? weeksToGoal({
          remainingMinor: goalProgress({
            saveMinor: countedMinor,
            reservedMinor: 0,
            targetMinor,
            planMinor: plan,
          }).remainingMinor,
          planMinor: plan,
          frequency: pace.frequency,
        })
      : null;

  async function submit() {
    if (!picked || saving) return;
    setError(undefined);
    const parsed = goalInputSchema(currency).safeParse({
      name: picked.name,
      emoji: picked.emoji,
      target,
      plan: plan ? toMajorString(plan, currency) : "",
    });
    if (!parsed.success) {
      const fields = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
      setError(fields.target?.[0] ?? fields.plan?.[0]);
      return;
    }
    setSaving(true);
    try {
      await save.mutateAsync(parsed.data);
      onNext();
    } catch (failure) {
      // `save_goal` refuses a plan over the allowance or the price with the plan's own line.
      const fields = isAppError(failure)
        ? (failure.fieldErrors as Record<string, string[]> | undefined)
        : undefined;
      setError(fields?.plan?.[0] ?? fields?.target?.[0] ?? (await actionErrorMessage(failure)));
    } finally {
      setSaving(false);
    }
  }

  if (!picked) {
    return (
      <OnboardingFrame step="goal" onSkip={onSkip} footer={<NotNow onPress={onNext} />}>
        <Heading sub={copy.sub} />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={copy.heading}
          className="flex-row flex-wrap gap-2"
        >
          {ONBOARDING_GOALS.map((option) => (
            <Pressable
              key={option.name}
              accessibilityRole="radio"
              accessibilityLabel={option.name}
              accessibilityState={{ checked: false }}
              onPress={() => setPicked(option)}
              className="min-h-24 w-[31.5%] grow items-center justify-center gap-2 rounded-3xl border-2 border-border bg-card p-2"
            >
              <Text className="text-[34px] leading-[42px]">{option.emoji}</Text>
              <Text numberOfLines={1} className="font-sans-bold text-small">
                {option.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      step="goal"
      onSkip={onSkip}
      footer={
        <>
          <Button
            variant="keycap"
            size="lg"
            disabled={!targetMinor}
            loading={saving}
            onPress={() => void submit()}
          >
            <Text>{copy.submit}</Text>
          </Button>
          <NotNow onPress={onNext} />
        </>
      }
    >
      <Heading />
      <View className="flex-row items-center gap-3">
        <Text className="text-[34px] leading-[42px]">{picked.emoji}</Text>
        <Text className="font-sans-extrabold text-h2">{picked.name}</Text>
      </View>
      <Text className="font-sans-bold text-muted-foreground">{copy.costLabel}</Text>
      <AmountKeypad value={target} onChange={setTarget} currency={currency} />
      {plan && weeks !== null && pace.frequency ? (
        <View className={cn("flex-row items-center gap-3 rounded-3xl bg-card p-4")}>
          <GoalRing
            emoji={picked.emoji}
            value={targetMinor ? countedMinor / targetMinor : 0}
            size={56}
          />
          <View className="flex-1">
            <Text className="font-sans-extrabold text-h3">
              {copy.plan(money(plan), pace.frequency)}
            </Text>
            <Text className="text-muted-foreground">{copy.weeks(weeks)}</Text>
          </View>
        </View>
      ) : null}
      <Notice message={error} calm />
    </OnboardingFrame>
  );
}

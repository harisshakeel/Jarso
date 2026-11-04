import {
  GOAL_EMOJI,
  type GoalView,
  goalCopy,
  goalInputSchema,
  goalProgress,
  previewLine,
} from "@jarso/core/goals";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { z } from "zod";
import { HomeWait, Notice, SubmitButton, useSendOnce } from "@/components/sheet";
import { Button, Input, Label, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { actionErrorMessage, cn, formatMoney, isAppError, parseMoney, toMajorString } from "@/lib";
import { PredictStep } from "./predict-step";
import { useAllowance, useGoal } from "./use-goal";
import { useArchiveGoal, useSaveGoal } from "./use-goal-mutations";

type FieldErrors = { name?: string[]; emoji?: string[]; target?: string[]; plan?: string[] };

/**
 * "Set a goal" / "Change my goal" (FR02): the child's own goal, with a live estimate. Mount it
 * once per opening: it starts from the saved goal each time.
 */
export function GoalSheet({ onClose }: { onClose: () => void }) {
  const home = useHome();
  const goal = useGoal();
  const allowance = useAllowance();
  const currency = home.data?.context.currency;
  // The allowance only shapes a hint, so it never holds the sheet up.
  if (!home.data || !currency || goal.data === undefined) {
    return <HomeWait error={home.error ?? goal.error} onClose={onClose} />;
  }
  return (
    <GoalForm
      goal={goal.data}
      currency={currency}
      allowanceMinor={allowance.data ?? null}
      saveMinor={home.data.availability.saveMinor}
      reservedMinor={home.data.availability.reservedSaveMinor}
      onClose={onClose}
    />
  );
}

type GoalFormProps = {
  goal: GoalView;
  currency: string;
  allowanceMinor: number | null;
  saveMinor: number;
  reservedMinor: number;
  onClose: () => void;
};

function GoalForm({
  goal: view,
  currency,
  allowanceMinor,
  saveMinor,
  reservedMinor,
  onClose,
}: GoalFormProps) {
  const goal = view?.goal ?? null;
  const [name, setName] = useState(goal?.name ?? "");
  const [emoji, setEmoji] = useState(goal?.emoji ?? "");
  const [target, setTarget] = useState(goal ? toMajorString(goal.targetMinor, currency) : "");
  const [plan, setPlan] = useState(goal?.planMinor ? toMajorString(goal.planMinor, currency) : "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [notice, setNotice] = useState<string>();
  const save = useSaveGoal();
  const once = useSendOnce();

  const targetParsed = parseMoney(target, currency);
  const planMinor = plan.trim() === "" ? null : parseMoney(plan, currency);
  // "About N more allowances" from counted Save (Save less money waiting to come out).
  const preview = targetParsed
    ? previewLine({
        targetMinor: targetParsed,
        savedMinor: Math.max(saveMinor - reservedMinor, 0),
        planMinor,
        currency,
      })
    : null;
  // FR05: a new plan on an unreached goal is a decision about savings, so the child predicts it.
  const targetMinor = targetParsed ?? goal?.targetMinor ?? null;
  const reached =
    goal !== null &&
    targetMinor !== null &&
    goalProgress({ saveMinor, reservedMinor, targetMinor, planMinor: goal.planMinor }).reached;
  const planChanged =
    goal !== null &&
    !reached &&
    planMinor !== null &&
    planMinor > 0 &&
    planMinor !== goal.planMinor;

  function submit() {
    return once(async () => {
      setNotice(undefined);
      const parsed = goalInputSchema(currency).safeParse({ name, emoji, target, plan });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        await save.mutateAsync(parsed.data);
        onClose();
      } catch (error) {
        // `save_goal` refuses a plan over the allowance or the price with the plan's own line.
        const errors = isAppError(error)
          ? (error.fieldErrors as FieldErrors | undefined)
          : undefined;
        if (errors) setFieldErrors(errors);
        else setNotice(await actionErrorMessage(error));
      }
    });
  }

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-6 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {goal ? goalCopy.sheet.titleChange : goalCopy.sheet.titleNew}
        </Text>
        <Text className="text-muted-foreground">{goalCopy.sheet.description}</Text>
      </View>
      <Field
        id="goal-name"
        label={goalCopy.sheet.nameLabel}
        value={name}
        onChange={setName}
        error={fieldErrors?.name?.[0]}
        maxLength={40}
      />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={goalCopy.sheet.emojiLegend}
        className="gap-2"
      >
        <Text className="font-sans-bold">{goalCopy.sheet.emojiLegend}</Text>
        <View className="flex-row flex-wrap gap-2">
          {GOAL_EMOJI.map((option) => {
            const checked = emoji === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={option}
                accessibilityState={{ checked }}
                onPress={() => setEmoji(option)}
                className={cn(
                  "h-11 w-11 items-center justify-center rounded-lg border",
                  checked ? "border-primary bg-secondary" : "border-border",
                )}
              >
                <Text className="text-h1">{option}</Text>
              </Pressable>
            );
          })}
        </View>
        <FieldError message={fieldErrors?.emoji?.[0]} />
      </View>
      <Field
        id="goal-target"
        label={goalCopy.sheet.targetLabel}
        value={target}
        onChange={setTarget}
        error={fieldErrors?.target?.[0]}
        money
      />
      <View className="gap-2">
        <Field
          id="goal-plan"
          label={goalCopy.sheet.planLabel}
          value={plan}
          onChange={setPlan}
          error={fieldErrors?.plan?.[0]}
          money
        />
        {allowanceMinor ? (
          <Text className="text-muted-foreground">
            {goalCopy.sheet.planHint(
              formatMoney(allowanceMinor, currency, { showMinor: "nonzero" }),
            )}
          </Text>
        ) : null}
      </View>
      {goal && planChanged && targetMinor !== null ? (
        <PredictStep
          move="change_plan"
          amountMinor={planMinor}
          goal={{ ...goal, targetMinor }}
          saveMinor={saveMinor}
          reservedMinor={reservedMinor}
          currency={currency}
          maxMinor={allowanceMinor ?? goal.targetMinor}
          onTryAmount={(minor) => setPlan(toMajorString(minor, currency))}
        />
      ) : preview ? (
        <Text
          accessibilityLiveRegion="polite"
          className="rounded-lg bg-muted px-3.5 py-2.5 font-sans-bold"
        >
          {preview}
        </Text>
      ) : null}
      <Notice message={notice} />
      <SubmitButton
        label={goalCopy.sheet.submit}
        pending={save.isPending}
        onPress={() => void submit()}
      />
      {goal ? <StartNewGoal goalId={goal.id} onDone={onClose} /> : null}
    </ScrollView>
  );
}

/** Archives the goal behind a confirm step, so the child can pick something new. */
function StartNewGoal({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();
  const archive = useArchiveGoal();
  const once = useSendOnce();

  const confirm = () =>
    once(async () => {
      setError(undefined);
      try {
        await archive.mutateAsync(goalId);
        setAsking(false);
        onDone();
      } catch (failure) {
        setError(await actionErrorMessage(failure));
      }
    });

  if (!asking) {
    return (
      <View className="gap-2">
        <Button
          variant="outline"
          size="lg"
          accessibilityLabel={goalCopy.newGoal.trigger}
          onPress={() => setAsking(true)}
        >
          <Text>{goalCopy.newGoal.trigger}</Text>
        </Button>
        <Notice message={error} />
      </View>
    );
  }
  return (
    <View accessibilityRole="alert" className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {goalCopy.newGoal.title}
      </Text>
      <Text className="text-muted-foreground">{goalCopy.newGoal.description}</Text>
      <Button
        variant="outline"
        size="lg"
        accessibilityLabel={goalCopy.newGoal.cancel}
        onPress={() => setAsking(false)}
      >
        <Text>{goalCopy.newGoal.cancel}</Text>
      </Button>
      <SubmitButton
        label={goalCopy.newGoal.confirm}
        pending={archive.isPending}
        onPress={() => void confirm()}
      />
      <Notice message={error} />
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" className="text-destructive">
      {message}
    </Text>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  money = false,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Money: the number pad and the big amount style. */
  money?: boolean;
  maxLength?: number;
}) {
  return (
    <View className="gap-2">
      <Label nativeID={`${id}-label`}>{label}</Label>
      <Input
        accessibilityLabel={label}
        aria-labelledby={`${id}-label`}
        aria-invalid={Boolean(error)}
        value={value}
        onChangeText={onChange}
        keyboardType={money ? "decimal-pad" : "default"}
        autoComplete="off"
        maxLength={maxLength}
        className={cn(money && "h-14 text-money-xl", error && "border-destructive")}
      />
      <FieldError message={error} />
    </View>
  );
}

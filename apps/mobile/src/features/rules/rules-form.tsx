import {
  type ChildRules,
  describeRule,
  type JarMovesMode,
  jarMovesSchema,
  jarMovesSentence,
  type MoneyRule,
  overspendSchema,
  type Period,
  type RuleKind,
  rulesCopy,
  setRuleSchema,
  spendingSummary,
  summarise,
} from "@jarso/core/rules";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, View } from "react-native";
import { z } from "zod";
import { Card, CardSeparator, KeyboardScrollView } from "@/components/screen";
import { Button, Switch, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { useFamily } from "@/features/family";
import { actionErrorMessage, cn, flash, toMajorString, toUserMessage } from "@/lib";
import { useChildRules, useSaveJarMoves, useSaveOverspend, useSaveRule } from "./use-rules";

const PERIODS: Period[] = ["item", "week", "month"];

/**
 * A child's money rules (the web's rules page), one card per area: spending (limits and going
 * below zero), how jar moves work, taking money out of Save, putting money in. Each card says
 * what is set now in plain words; a rule is on because it is there, with Change and Remove.
 */
export function RulesForm({ childId }: { childId: string }) {
  const family = useFamily();
  const rules = useChildRules(childId);
  const child = family.data?.children.find((item) => item.id === childId);
  const failed = rules.error ?? family.error;
  const refresh = () => {
    void rules.refetch();
    if (family.error) void family.refetch();
  };

  if (!rules.data || !family.data || !child) {
    return (
      <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
        {failed ? (
          <>
            <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
              {toUserMessage(failed)}
            </Text>
            <Button size="lg" accessibilityLabel="Try again" onPress={refresh}>
              <Text>Try again</Text>
            </Button>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel={rulesCopy.title} />
        )}
      </View>
    );
  }

  return (
    <KeyboardScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={rules.isRefetching} onRefresh={refresh} />}
    >
      <Text className="text-muted-foreground">{rulesCopy.intro(child.nickname)}</Text>
      <RuleCards
        childId={childId}
        nickname={child.nickname}
        currency={family.data.family.currency}
        rules={rules.data}
      />
    </KeyboardScrollView>
  );
}

function RuleCards({
  childId,
  nickname,
  currency,
  rules,
}: {
  childId: string;
  nickname: string;
  currency: string;
  rules: ChildRules;
}) {
  const of = (kind: RuleKind) => rules.rules.filter((rule) => rule.kind === kind);
  const shared = { childId, nickname, currency };
  const notify = rules.jarMovesApproval === "notify";
  return (
    <>
      <RuleCard title={rulesCopy.spending} now={spendingSummary(rules, nickname)}>
        <RuleGroup
          {...shared}
          kind="spend_limit"
          rules={of("spend_limit")}
          addLabel={rulesCopy.addSpendLimit}
          emptyLine={rulesCopy.spendLimitEmpty(nickname)}
        />
        <CardSeparator />
        {/* Keyed by the saved value, so a refetch resets the switch to what the server has. */}
        <OverspendSwitch
          key={String(rules.allowNegativeSpend)}
          childId={childId}
          nickname={nickname}
          allowed={rules.allowNegativeSpend}
        />
      </RuleCard>
      <RuleCard title={rulesCopy.moves}>
        <JarMovesChoice
          key={rules.jarMovesApproval}
          childId={childId}
          nickname={nickname}
          mode={rules.jarMovesApproval}
        />
      </RuleCard>
      <RuleCard
        title={rulesCopy.takeOut}
        now={notify ? rulesCopy.takeOutNotify : summarise(rules.rules, "withdrawal", currency)}
      >
        <CardPart title={rulesCopy.capTitle(nickname)}>
          <RuleGroup
            {...shared}
            kind="withdrawal_cap"
            rules={of("withdrawal_cap")}
            addLabel={rulesCopy.addCap}
            emptyLine={rulesCopy.capEmpty}
          />
        </CardPart>
        <CardPart title={rulesCopy.autoTitle(nickname)}>
          <RuleGroup
            {...shared}
            kind="withdrawal_auto_approve"
            rules={of("withdrawal_auto_approve")}
            addLabel={rulesCopy.addAuto(nickname)}
            emptyLine={rulesCopy.autoEmpty}
          />
        </CardPart>
      </RuleCard>
      <RuleCard
        title={rulesCopy.putIn}
        now={notify ? rulesCopy.putInNotify : summarise(rules.rules, "deposit", currency)}
      >
        <RuleGroup
          {...shared}
          kind="deposit_auto_confirm"
          rules={of("deposit_auto_confirm")}
          addLabel={rulesCopy.addDeposit}
          emptyLine={rulesCopy.depositEmpty(nickname)}
        />
        <Text className="text-muted-foreground text-small">{rulesCopy.depositNote(nickname)}</Text>
      </RuleCard>
    </>
  );
}

/** One rule area: the title, what is set right now, then its controls. */
function RuleCard({
  title,
  now,
  children,
}: {
  title: string;
  now?: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {title}
      </Text>
      {now ? <Text className="font-sans-semibold">{now}</Text> : null}
      {children}
    </Card>
  );
}

/** A titled part of a card (the two take-out questions), set off by a hairline. */
function CardPart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <CardSeparator />
      <Text accessibilityRole="header" className="font-sans-semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" className="text-destructive">
      {message}
    </Text>
  );
}

type RuleGroupProps = {
  childId: string;
  nickname: string;
  currency: string;
  kind: RuleKind;
  /** The saved rules of this kind. */
  rules: MoneyRule[];
  /** The button that starts a new rule, e.g. "Add a spending limit". */
  addLabel: string;
  /** What this kind means, shown when there is no rule yet. */
  emptyLine: string;
};

type Draft = { period: Period; amount: string };

/**
 * One kind of rule as the sentences it makes: each rule with Change and Remove, and one button
 * to add another for a period not used yet. An empty amount (Remove) clears the rule.
 */
function RuleGroup({
  childId,
  nickname,
  currency,
  kind,
  rules,
  addLabel,
  emptyLine,
}: RuleGroupProps) {
  const save = useSaveRule(childId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [fieldError, setFieldError] = useState<string[]>();
  const [formError, setFormError] = useState<string>();
  const pending = save.isPending;

  const freePeriods = PERIODS.filter((period) => !rules.some((rule) => rule.period === period));

  async function send(period: Period, amount: string, done: string): Promise<void> {
    if (pending) return;
    setFormError(undefined);
    const parsed = setRuleSchema(currency).safeParse({ childId, kind, period, amount });
    if (!parsed.success) {
      // The schema renames `amount` on output, so its errors are typed by the output's keys.
      const errors = z.flattenError(parsed.error).fieldErrors as { amount?: string[] };
      setFieldError(errors.amount);
      return;
    }
    setFieldError(undefined);
    try {
      await save.mutateAsync(parsed.data);
      flash(done);
      setDraft(null);
      setEditing(null);
    } catch (error) {
      setFormError(await actionErrorMessage(error));
    }
  }

  return (
    <View className="gap-2">
      {rules.length === 0 && !draft ? (
        <Text className="text-muted-foreground">{emptyLine}</Text>
      ) : null}
      {rules.map((rule) => {
        const sentence = describeRule(rule, nickname, currency);
        if (editing?.period === rule.period) {
          return (
            <AmountForm
              key={rule.period}
              value={editing.amount}
              onChange={(amount) => setEditing({ ...editing, amount })}
              errors={fieldError}
              pending={pending}
              onSave={() => void send(rule.period, editing.amount, rulesCopy.saved)}
              onCancel={() => setEditing(null)}
            />
          );
        }
        return (
          <View key={rule.period} className="gap-1 rounded-xl bg-muted px-3 py-2">
            <Text className="font-sans-semibold">{sentence}</Text>
            <View className="flex-row gap-1">
              <Button
                variant="ghost"
                size="sm"
                accessibilityLabel={rulesCopy.changeLabel(sentence)}
                disabled={pending}
                onPress={() => {
                  setDraft(null);
                  setFieldError(undefined);
                  setEditing({
                    period: rule.period,
                    amount: toMajorString(rule.amountMinor, currency),
                  });
                }}
              >
                <Text>{rulesCopy.change}</Text>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                accessibilityLabel={rulesCopy.removeLabel(sentence)}
                accessibilityState={{ busy: pending, disabled: pending }}
                disabled={pending}
                onPress={() => void send(rule.period, "", rulesCopy.removed)}
              >
                <Text>{rulesCopy.remove}</Text>
              </Button>
            </View>
          </View>
        );
      })}
      {draft ? (
        <View className="gap-3 rounded-xl border border-border p-3">
          <View className="gap-2">
            <Text className="font-sans-semibold">{rulesCopy.howOften}</Text>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {freePeriods.map((period) => (
                <Chip
                  key={period}
                  label={rulesCopy.periodLabels[period]}
                  checked={draft.period === period}
                  onPress={() => setDraft({ ...draft, period })}
                />
              ))}
            </View>
          </View>
          <AmountForm
            value={draft.amount}
            onChange={(amount) => setDraft({ ...draft, amount })}
            errors={fieldError}
            pending={pending}
            onSave={() => void send(draft.period, draft.amount, rulesCopy.saved)}
            onCancel={() => setDraft(null)}
          />
        </View>
      ) : freePeriods.length > 0 ? (
        <Button
          variant="outline"
          className="self-start"
          accessibilityLabel={addLabel}
          onPress={() => {
            setEditing(null);
            setFieldError(undefined);
            setDraft({ period: freePeriods[0] ?? "week", amount: "" });
          }}
        >
          <Text>{addLabel}</Text>
        </Button>
      ) : null}
      <FormError message={formError} />
    </View>
  );
}

function AmountForm({
  value,
  onChange,
  errors,
  pending,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (amount: string) => void;
  errors?: string[];
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="gap-3">
      <Field
        label={rulesCopy.amount}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        errors={errors}
      />
      <View className="flex-row gap-2">
        <Button
          variant="keycap"
          accessibilityLabel={rulesCopy.save}
          accessibilityState={{ busy: pending, disabled: pending }}
          disabled={pending}
          onPress={onSave}
        >
          {pending ? <ActivityIndicator color="white" /> : <Text>{rulesCopy.save}</Text>}
        </Button>
        <Button variant="ghost" accessibilityLabel={rulesCopy.cancel} onPress={onCancel}>
          <Text>{rulesCopy.cancel}</Text>
        </Button>
      </View>
    </View>
  );
}

/** A choice as a pill: one of a radio group. */
function Chip({
  label,
  checked,
  disabled = false,
  onPress,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-12 justify-center rounded-full border px-4",
        checked ? "border-primary bg-secondary" : "border-border bg-card",
      )}
    >
      <Text className="font-sans-semibold">{label}</Text>
    </Pressable>
  );
}

/**
 * Ask first (a request waits for the parent's yes and hand-over) or just tell (recorded at once,
 * the parent gets a note). Switches at once and switches back with the error if the save fails.
 */
function JarMovesChoice({
  childId,
  nickname,
  mode,
}: {
  childId: string;
  nickname: string;
  mode: JarMovesMode;
}) {
  const save = useSaveJarMoves(childId);
  const [chosen, setChosen] = useState(mode);
  const [error, setError] = useState<string>();

  async function choose(next: JarMovesMode) {
    if (next === chosen || save.isPending) return;
    const parsed = jarMovesSchema.parse({ childId, mode: next });
    const previous = chosen;
    setChosen(next);
    setError(undefined);
    try {
      await save.mutateAsync(parsed.mode);
      flash(rulesCopy.saved);
    } catch (cause) {
      setChosen(previous);
      setError(await actionErrorMessage(cause));
    }
  }

  return (
    <View className="gap-2">
      <Text className="font-sans-semibold">{jarMovesSentence(chosen, nickname)}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={rulesCopy.jarMovesLegend(nickname)}
        className="flex-row flex-wrap gap-2"
      >
        {rulesCopy.jarMovesOptions.map((option) => (
          <Chip
            key={option.mode}
            label={option.label}
            checked={option.mode === chosen}
            disabled={save.isPending}
            onPress={() => void choose(option.mode)}
          />
        ))}
      </View>
      <Text className="text-muted-foreground text-small">
        {chosen === "notify" ? rulesCopy.jarMovesNotify : rulesCopy.jarMovesAsk}
      </Text>
      <FormError message={error} />
    </View>
  );
}

/** Whether Spend may go below zero (default off). Flips back with the error if the save fails. */
function OverspendSwitch({
  childId,
  nickname,
  allowed,
}: {
  childId: string;
  nickname: string;
  allowed: boolean;
}) {
  const save = useSaveOverspend(childId);
  const [on, setOn] = useState(allowed);
  const [error, setError] = useState<string>();
  const label = rulesCopy.overspend(nickname);

  async function change(next: boolean) {
    const parsed = overspendSchema.parse({ childId, allowed: next });
    setOn(next);
    setError(undefined);
    try {
      await save.mutateAsync(parsed.allowed);
      flash(rulesCopy.saved);
    } catch (cause) {
      setOn(!next);
      setError(await actionErrorMessage(cause));
    }
  }

  return (
    <View className="gap-1">
      <View className="min-h-12 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 font-sans-semibold">{label}</Text>
        <Switch
          accessibilityLabel={label}
          value={on}
          disabled={save.isPending}
          onValueChange={(next) => void change(next)}
        />
      </View>
      <Text className="text-muted-foreground text-small">
        {on ? rulesCopy.overspendOn(nickname) : rulesCopy.overspendOff(nickname)}
      </Text>
      <FormError message={error} />
    </View>
  );
}

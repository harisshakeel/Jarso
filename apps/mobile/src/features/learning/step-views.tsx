import type { StepBody } from "@jarso/core/learning";
import { type Draft, inputCopy, renderText, stableShuffle } from "@jarso/core/learning";
import { Pressable, View } from "react-native";
import { Button, Input, Label, Text } from "@/components/ui";
import { cn, formatMoney, minorDigits } from "@/lib";
import { PictureOptions } from "./picture-options";

type InputProps<D extends Draft["kind"]> = {
  body: StepBody;
  draft: Extract<Draft, { kind: D }>;
  onChange: (draft: Draft) => void;
  currency: string;
  /** Locked once the step's outcome is showing. */
  disabled: boolean;
  /** Prefix for native ids, unique per step. */
  idBase: string;
};

/** A 44 pt radio row or chip: the phone's twin of the web's radio cards. */
function Radio({
  label,
  checked,
  disabled,
  onPress,
  chip = false,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
  chip?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-11 justify-center border border-border",
        chip ? "flex-1 items-center rounded-full px-4" : "rounded-[18px] bg-card px-4 py-3",
        checked && (chip ? "border-primary bg-primary" : "border-primary bg-secondary"),
      )}
    >
      <Text
        className={cn(
          "font-sans-semibold",
          checked && chip && "text-primary-foreground",
          checked && !chip && "text-secondary-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Choice, predict and reason steps: one option from two to four, as picture tiles. */
function OptionInput({ body, draft, onChange, currency, disabled }: InputProps<"option">) {
  if (body.type !== "choice" && body.type !== "predict" && body.type !== "reason") return null;
  return (
    <PictureOptions
      options={body.options.map((option) => ({
        id: option.id,
        text: renderText(option.text, currency),
      }))}
      selected={draft.optionId}
      disabled={disabled}
      onSelect={(optionId) => onChange({ kind: "option", optionId })}
    />
  );
}

/** The currency's symbol, as the web shows beside the amount box. */
function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat("en-GB", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? ""
  );
}

/** Amount steps: money in the family currency, or a whole count ("weeks"). */
function NumberInput({ body, draft, onChange, currency, disabled, idBase }: InputProps<"number">) {
  if (body.type !== "amount") return null;
  const money = body.unit === "money";
  const symbol = money ? currencySymbol(currency) : "";
  const placeholder = money ? (minorDigits(currency) > 0 ? "0.00" : "0") : "0";
  return (
    <View className="gap-2">
      <Label nativeID={`${idBase}-number`}>{inputCopy.yourAnswer}</Label>
      <View className="flex-row items-center gap-2">
        {symbol ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            className="font-sans-bold text-muted-foreground text-money"
          >
            {symbol}
          </Text>
        ) : null}
        <Input
          accessibilityLabel={inputCopy.yourAnswer}
          aria-labelledby={`${idBase}-number`}
          value={draft.text}
          onChangeText={(text) => onChange({ kind: "number", text })}
          editable={!disabled}
          keyboardType={money ? "decimal-pad" : "number-pad"}
          autoComplete="off"
          placeholder={placeholder}
          className="h-14 w-40 font-sans-bold text-money"
        />
        {body.suffix ? (
          <Text className="font-sans-semibold text-muted-foreground">{body.suffix}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** Split steps: a −/+ stepper for the Save part (the web's slider); Spend is the rest. */
function SplitInput({ body, draft, onChange, currency, disabled }: InputProps<"split">) {
  if (body.type !== "split") return null;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const spend = body.total - draft.save;
  const nudge = (by: number) => {
    const save = Math.min(body.total, Math.max(0, draft.save + by));
    onChange({ kind: "split", save });
  };
  return (
    <View className="gap-4">
      <View accessibilityLiveRegion="polite" className="flex-row gap-3">
        <View className="flex-1 rounded-[18px] bg-secondary p-3">
          <Text className="font-sans-semibold">{inputCopy.spend}</Text>
          <Text className="font-sans-extrabold text-money-l">{money(spend)}</Text>
        </View>
        <View className="flex-1 rounded-[18px] bg-accent p-3">
          <Text className="font-sans-semibold">{inputCopy.save}</Text>
          <Text className="font-sans-extrabold text-money-l">{money(draft.save)}</Text>
        </View>
      </View>
      <Text className="font-sans-semibold">{inputCopy.splitLabelStepper}</Text>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={inputCopy.saveAmount}
        accessibilityValue={{ text: money(draft.save) }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          nudge(event.nativeEvent.actionName === "increment" ? body.increment : -body.increment);
        }}
        className="flex-row items-center justify-between gap-3"
      >
        <Button
          variant="outline"
          size="icon"
          accessibilityLabel={inputCopy.saveLess}
          disabled={disabled || draft.save <= 0}
          onPress={() => nudge(-body.increment)}
        >
          <Text>−</Text>
        </Button>
        <View className="flex-1 flex-row justify-between">
          <Text className="text-muted-foreground">{inputCopy.allSpend}</Text>
          <Text className="text-muted-foreground">{inputCopy.allSave}</Text>
        </View>
        <Button
          variant="outline"
          size="icon"
          accessibilityLabel={inputCopy.saveMore}
          disabled={disabled || draft.save >= body.total}
          onPress={() => nudge(body.increment)}
        >
          <Text>+</Text>
        </Button>
      </View>
    </View>
  );
}

/** Sort steps: each item goes in one of two groups. */
function SortInput({ body, draft, onChange, currency, disabled }: InputProps<"sort">) {
  if (body.type !== "sort") return null;
  return (
    <View className="gap-3">
      {body.items.map((item) => {
        const text = renderText(item.text, currency);
        return (
          <View
            key={item.id}
            accessibilityRole="radiogroup"
            accessibilityLabel={text}
            className="gap-2 rounded-[24px] border border-border bg-card p-3"
          >
            <Text className="font-sans-semibold">{text}</Text>
            <View className="flex-row gap-2">
              {body.buckets.map((bucket) => (
                <Radio
                  key={bucket.id}
                  chip
                  label={bucket.label}
                  checked={draft.placements[item.id] === bucket.id}
                  disabled={disabled}
                  onPress={() =>
                    onChange({
                      kind: "sort",
                      placements: { ...draft.placements, [item.id]: bucket.id },
                    })
                  }
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Match steps: pick the meaning for each word (the web's select, as radios). */
function MatchInput({ body, draft, onChange, currency, disabled, idBase }: InputProps<"match">) {
  if (body.type !== "match") return null;
  const meanings = stableShuffle(body.pairs, idBase, (pair) => pair.id);
  return (
    <View className="gap-4">
      {body.pairs.map((pair) => (
        <View
          key={pair.id}
          accessibilityRole="radiogroup"
          accessibilityLabel={pair.term}
          className="gap-2"
        >
          <Text className="font-sans-bold">{pair.term}</Text>
          <Text className="text-muted-foreground">{inputCopy.chooseMeaning}</Text>
          {meanings.map((meaning) => (
            <Radio
              key={meaning.id}
              label={renderText(meaning.meaning, currency)}
              checked={draft.pairs[pair.id] === meaning.id}
              disabled={disabled}
              onPress={() =>
                onChange({ kind: "match", pairs: { ...draft.pairs, [pair.id]: meaning.id } })
              }
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** The right input for a step's draft. */
export function StepInput(props: Omit<InputProps<Draft["kind"]>, "draft"> & { draft: Draft }) {
  const { draft } = props;
  switch (draft.kind) {
    case "option":
      return <OptionInput {...props} draft={draft} />;
    case "number":
      return <NumberInput {...props} draft={draft} />;
    case "split":
      return <SplitInput {...props} draft={draft} />;
    case "sort":
      return <SortInput {...props} draft={draft} />;
    case "match":
      return <MatchInput {...props} draft={draft} />;
  }
}

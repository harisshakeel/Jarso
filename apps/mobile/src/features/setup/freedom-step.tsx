import { FREEDOM_PRESETS, type FreedomPreset, smallCapMinor } from "@jarso/core/rules";
import { setupFlowCopy } from "@jarso/core/setup";
import { CheckIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { useFamilyContext } from "@/features/allowance";
import { actionErrorMessage, cn, formatMoney, useTokens } from "@/lib";
import { SetupFrame, StepHeading } from "./setup-frame";
import { useApplyFreedom } from "./use-freedom";

const copy = setupFlowCopy.freedom;

function Option({
  label,
  hint,
  checked,
  onPress,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onPress: () => void;
}) {
  const tokens = useTokens();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${label}. ${hint}`}
      accessibilityState={{ checked }}
      onPress={onPress}
      className={cn(
        "min-h-16 flex-row items-center gap-3 rounded-3xl border-2 p-4",
        checked ? "border-primary bg-secondary" : "border-border bg-card",
      )}
    >
      <View className="flex-1 gap-0.5">
        <Text className="font-sans-bold">{label}</Text>
        <Text className="text-ink-2">{hint}</Text>
      </View>
      <View
        className={cn(
          "h-6 w-6 items-center justify-center rounded-full border-2",
          checked ? "border-primary bg-primary" : "border-input",
        )}
      >
        {checked ? <CheckIcon size={14} color={tokens["primary-foreground"]} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * Step 6: how much freedom, as three presets mapped onto the rules (core `freedomWrites`). "Ask
 * me every time" is the default and writes nothing. The details stay on the child's Rules page.
 */
export function FreedomStep({
  childId,
  nickname,
  onDone,
}: {
  childId: string;
  nickname: string;
  onDone: () => void;
}) {
  const context = useFamilyContext();
  const apply = useApplyFreedom(childId);
  const once = useSendOnce();
  const [preset, setPreset] = useState<FreedomPreset>("ask");
  const [error, setError] = useState<string>();
  const currency = context.data?.currency;
  const capMinor = currency ? smallCapMinor(currency) : null;

  const hints: Record<FreedomPreset, string> = {
    ask: copy.options.ask.hint,
    small:
      capMinor && currency
        ? copy.options.small.hint(formatMoney(capMinor, currency, { showMinor: "nonzero" }))
        : "",
    free: copy.options.free.hint,
  };
  const labels: Record<FreedomPreset, string> = {
    ask: copy.options.ask.label,
    small: copy.options.small.label,
    free: copy.options.free.label(nickname),
  };

  const submit = () =>
    once(async () => {
      setError(undefined);
      try {
        if (preset !== "ask") {
          if (capMinor === null) return;
          await apply.mutateAsync({ preset, capMinor });
        }
        onDone();
      } catch (cause) {
        setError(await actionErrorMessage(cause));
      }
    });

  // "Small ones" needs the family's currency for its cap; the others never wait for it.
  const options = FREEDOM_PRESETS.filter((value) => value !== "small" || capMinor !== null);
  return (
    <SetupFrame
      step="freedom"
      footer={
        <Button
          variant="keycap"
          size="lg"
          loading={apply.isPending}
          accessibilityLabel={copy.submit}
          onPress={() => void submit()}
        >
          <Text>{copy.submit}</Text>
        </Button>
      }
    >
      <StepHeading title={copy.title} line={copy.question(nickname)} />
      <View accessibilityRole="radiogroup" className="gap-3">
        {options.map((value) => (
          <Option
            key={value}
            label={labels[value]}
            hint={hints[value]}
            checked={preset === value}
            onPress={() => setPreset(value)}
          />
        ))}
      </View>
      <Text className="text-muted-foreground">{copy.later(nickname)}</Text>
      <Notice message={error} />
    </SetupFrame>
  );
}

import { useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button, Input, Label, Text } from "@/components/ui";
import { cn, toUserMessage } from "@/lib";

const AMOUNT_LABEL = "Amount";
const REASON_LABEL = "What's it for?";

/**
 * Runs `task` unless one is already running. A ref, not the mutation's `isPending`: two taps in
 * one frame both see the old render.
 */
export function useSendOnce() {
  const busy = useRef(false);
  return async (task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await task();
    } finally {
      busy.current = false;
    }
  };
}

/** Until the family's currency has loaded there is nothing to show. */
export function HomeWait({ error, onClose }: { error: unknown; onClose: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      {error ? (
        <>
          <Text accessibilityRole="alert" className="text-center">
            {toUserMessage(error)}
          </Text>
          <Button accessibilityLabel="Close" onPress={onClose}>
            <Text>Close</Text>
          </Button>
        </>
      ) : (
        <ActivityIndicator accessibilityLabel="Loading" />
      )}
    </View>
  );
}

export function AmountInput({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <View className="gap-2">
      <Label nativeID={`${id}-amount-label`}>{AMOUNT_LABEL}</Label>
      <Input
        accessibilityLabel={AMOUNT_LABEL}
        aria-labelledby={`${id}-amount-label`}
        aria-invalid={Boolean(error)}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        autoComplete="off"
        className={cn("h-14 text-money-xl", error && "border-destructive")}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function ReasonInput({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <View className="gap-2">
      <Label nativeID={`${id}-reason-label`}>{REASON_LABEL}</Label>
      <Input
        accessibilityLabel={REASON_LABEL}
        aria-labelledby={`${id}-reason-label`}
        aria-invalid={Boolean(error)}
        value={value}
        onChangeText={onChange}
        autoComplete="off"
        maxLength={140}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function RuleLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <View className="gap-1">
      {lines.map((line) => (
        <Text key={line} className="text-muted-foreground">
          {line}
        </Text>
      ))}
    </View>
  );
}

/** A refusal or a failed send: the sheet stays open and the child can try again. */
export function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" className="text-destructive">
      {message}
    </Text>
  );
}

export function SubmitButton({
  label,
  pending,
  onPress,
  disabled = false,
}: {
  label: string;
  pending: boolean;
  onPress: () => void;
  /** Not ready to send yet (a required choice is missing). */
  disabled?: boolean;
}) {
  return (
    <Button
      size="lg"
      accessibilityLabel={label}
      accessibilityState={{ busy: pending, disabled: pending || disabled }}
      disabled={pending || disabled}
      onPress={onPress}
    >
      {pending ? <ActivityIndicator color="white" /> : <Text>{label}</Text>}
    </Button>
  );
}

/** What the child reads once the request is in. */
export function SentView({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <View className="flex-1 gap-4 bg-background p-6">
      <Text accessibilityLiveRegion="polite" className="font-sans-bold text-h3">
        {message}
      </Text>
      <Button size="lg" accessibilityLabel="Done" onPress={onClose}>
        <Text>Done</Text>
      </Button>
    </View>
  );
}

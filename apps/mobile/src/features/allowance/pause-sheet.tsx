import { pauseCopy, pauseSchema } from "@jarso/core/allowance";
import { useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Notice, SubmitButton, useSendOnce } from "@/components/sheet";
import { Button, DateField, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { actionErrorMessage, addDays, flash } from "@/lib";
import { ChoiceChip } from "./allowance-form";
import { usePauseAllowance } from "./use-allowance-mutations";

type Props = {
  childId: string;
  scheduleId: string;
  nickname: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
};

/** "Pause" (the web's PauseSheet): a button that opens the pause form in a sheet. */
export function PauseSheet(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="lg"
        accessibilityLabel={pauseCopy.pause}
        onPress={() => setOpen(true)}
      >
        <Text>{pauseCopy.pause}</Text>
      </Button>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        {/* Inside the modal, so it opens fresh each time. */}
        {open ? <PauseForm {...props} onDone={() => setOpen(false)} /> : null}
      </Modal>
    </>
  );
}

type Until = (typeof pauseCopy.untilOptions)[number]["value"];
type FieldErrors = { through?: string[]; message?: string[] };

/** Until a date, or until a parent resumes it, with an optional message for the child. */
function PauseForm({
  childId,
  scheduleId,
  nickname,
  today,
  onDone,
}: Props & { onDone: () => void }) {
  const pause = usePauseAllowance();
  const once = useSendOnce();
  const [until, setUntil] = useState<Until>("date");
  const [through, setThrough] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [error, setError] = useState<string>();

  const submit = () =>
    once(async () => {
      setError(undefined);
      const parsed = pauseSchema(today).safeParse({
        scheduleId,
        // Blank is "until I resume it"; a date choice with no day picked yet is refused.
        through: until === "date" ? (through ?? "-") : "",
        message,
      });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        await pause.mutateAsync({ childId, ...parsed.data });
        flash(pauseCopy.paused);
        onDone();
      } catch (cause) {
        setError(await actionErrorMessage(cause));
      }
    });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-4 p-6" keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-sans-bold text-h3">
            {pauseCopy.title(nickname)}
          </Text>
          <Text className="text-muted-foreground">{pauseCopy.body}</Text>
        </View>
        <View className="gap-2">
          <Text className="font-sans-semibold">{pauseCopy.until}</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={pauseCopy.until}
            className="flex-row flex-wrap gap-2"
          >
            {pauseCopy.untilOptions.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                checked={until === option.value}
                onPress={() => setUntil(option.value)}
              />
            ))}
          </View>
        </View>
        {until === "date" ? (
          <DateField
            label={pauseCopy.pauseUntil}
            value={through}
            onChange={setThrough}
            minimumDate={today}
            maximumDate={addDays(today, 366)}
            errors={fieldErrors?.through}
          />
        ) : null}
        <Field
          label={pauseCopy.messageLabel(nickname)}
          value={message}
          onChangeText={setMessage}
          maxLength={140}
          autoComplete="off"
          errors={fieldErrors?.message}
        />
        <Notice message={error} />
        <SubmitButton
          label={pauseCopy.pause}
          pending={pause.isPending}
          onPress={() => void submit()}
        />
        <Button variant="ghost" accessibilityLabel={pauseCopy.cancel} onPress={onDone}>
          <Text>{pauseCopy.cancel}</Text>
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

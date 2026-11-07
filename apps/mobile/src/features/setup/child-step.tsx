import { addChildCopy, addChildSchema, type ChildSummary } from "@jarso/core/family";
import { setupFlowCopy } from "@jarso/core/setup";
import { ShieldCheckIcon } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import {
  type ChildFieldErrors,
  ChildFields,
  type ChildFieldValues,
  consentValue,
  JarsoNotice,
  useAddChild,
} from "@/features/family";
import { actionErrorMessage, isAppError, useTokens } from "@/lib";
import { SetupFrame, StepHeading } from "./setup-frame";

const copy = setupFlowCopy.child;

const fieldsCopy = {
  nickname: copy.nickname,
  nicknameHelp: copy.nicknameHelp,
  pin: copy.pin,
  pinHelp: copy.pinHelp,
  consent: addChildCopy.consent,
};

/** The data promise, shown with the fields rather than buried: a nickname is all Jarso keeps. */
function DataPromise() {
  const tokens = useTokens();
  return (
    <View className="flex-row items-center gap-3 rounded-3xl bg-tint-teal p-4">
      <ShieldCheckIcon size={28} color={tokens.primary} />
      <View className="flex-1">
        <Text className="font-sans-bold">{copy.promiseTitle}</Text>
        <Text className="text-ink-2">{copy.promise}</Text>
      </View>
    </View>
  );
}

/**
 * Step 4: the first child, through the same server route and schema as Settings → Add a child
 * (`register_child`: nickname, PIN, consent). The PIN goes to the server and leaves state; the
 * steps after this one get the child's id and nickname only.
 */
export function ChildStep({
  onAdded,
  onLater,
}: {
  onAdded: (child: ChildSummary) => void;
  onLater: () => void;
}) {
  const add = useAddChild();
  const once = useSendOnce();
  const [values, setValues] = useState<ChildFieldValues>({ nickname: "", pin: "", consent: false });
  const [fieldErrors, setFieldErrors] = useState<ChildFieldErrors>();
  const [error, setError] = useState<string>();

  const submit = () =>
    once(async () => {
      setError(undefined);
      const parsed = addChildSchema.safeParse({ ...values, consent: consentValue(values.consent) });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error).fieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        const child = await add.mutateAsync(parsed.data);
        setValues({ nickname: "", pin: "", consent: false });
        onAdded(child);
      } catch (cause) {
        setValues((current) => ({ ...current, pin: "" }));
        if (isAppError(cause) && cause.fieldErrors) {
          setFieldErrors(cause.fieldErrors as ChildFieldErrors);
          return;
        }
        setError(await actionErrorMessage(cause));
      }
    });

  const label = copy.submit(values.nickname);
  return (
    <SetupFrame
      step="child"
      footer={
        <>
          <Button
            variant="keycap"
            size="lg"
            loading={add.isPending}
            accessibilityLabel={label}
            onPress={() => void submit()}
          >
            <Text>{label}</Text>
          </Button>
          <Button variant="ghost" accessibilityLabel={copy.later} onPress={onLater}>
            <Text>{copy.later}</Text>
          </Button>
        </>
      }
    >
      <StepHeading title={copy.title} line={copy.moreLater} />
      <ChildFields copy={fieldsCopy} values={values} onChange={setValues} errors={fieldErrors} />
      <DataPromise />
      <Notice message={error} />
      <JarsoNotice />
    </SetupFrame>
  );
}

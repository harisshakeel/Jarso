import { addChildCopy, addChildSchema } from "@jarso/core/family";
import { jarsoNoticeCopy } from "@jarso/core/guide";
import { useRouter } from "expo-router";
import { CheckIcon } from "lucide-react-native";
import { type Dispatch, type SetStateAction, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { z } from "zod";
import { Card } from "@/components/screen";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { useParentGuideState } from "@/features/guide";
import { actionErrorMessage, cn, flash, isAppError, useTokens } from "@/lib";
import { useAddChild } from "./use-family-mutations";

export type ChildFieldErrors = { nickname?: string[]; pin?: string[]; consent?: string[] };

type ChildFieldsCopy = {
  nickname: string;
  nicknameHelp: string;
  pin: string;
  pinHelp: string;
  consent: string;
};

/** Nickname, PIN and the parent's consent: the shared part of adding a child and accepting one. */
export type ChildFieldValues = { nickname: string; pin: string; consent: boolean };

/** The consent tick box (the web's Checkbox): a 48 dp row, read out as a checkbox. */
function ConsentBox({
  label,
  checked,
  onChange,
  errors,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  errors?: string[];
}) {
  const tokens = useTokens();
  const error = errors?.[0];
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        className="min-h-12 flex-row items-center gap-3"
      >
        <View
          className={cn(
            "h-6 w-6 items-center justify-center rounded-md border-2",
            checked ? "border-primary bg-primary" : error ? "border-destructive" : "border-input",
          )}
        >
          {checked ? <CheckIcon size={16} color={tokens["primary-foreground"]} /> : null}
        </View>
        <Text className="flex-1 font-sans-semibold">{label}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function ChildFields({
  copy,
  values,
  onChange,
  errors,
}: {
  copy: ChildFieldsCopy;
  values: ChildFieldValues;
  /** The form's state setter: each field updates from the latest values. */
  onChange: Dispatch<SetStateAction<ChildFieldValues>>;
  errors?: ChildFieldErrors;
}) {
  return (
    <Card className="gap-4">
      <Field
        label={copy.nickname}
        value={values.nickname}
        onChangeText={(nickname) => onChange((current) => ({ ...current, nickname }))}
        autoComplete="off"
        autoCorrect={false}
        maxLength={20}
        description={copy.nicknameHelp}
        errors={errors?.nickname}
      />
      <Field
        label={copy.pin}
        value={values.pin}
        onChangeText={(pin) => onChange((current) => ({ ...current, pin }))}
        keyboardType="number-pad"
        secureTextEntry
        autoComplete="off"
        maxLength={6}
        description={copy.pinHelp}
        errors={errors?.pin}
      />
      <ConsentBox
        label={copy.consent}
        checked={values.consent}
        onChange={(consent) => onChange((current) => ({ ...current, consent }))}
        errors={errors?.consent}
      />
    </Card>
  );
}

/** Jarso is on by default (ADR 0011): the parent is told before a child joins, where it runs. */
export function JarsoNotice() {
  const guide = useParentGuideState();
  if (guide.data?.configured !== true) return null;
  return (
    <Card className="gap-2 border-0 bg-secondary">
      <Text accessibilityRole="header" className="font-sans-semibold">
        {jarsoNoticeCopy.title}
      </Text>
      <Text>{jarsoNoticeCopy.body}</Text>
    </Card>
  );
}

/** The consent value as the schema reads it: a tick is `true`, no tick is missing. */
export const consentValue = (consent: boolean) => (consent ? true : undefined);

/**
 * Adding a child to the parent's own family (the web's AddChildForm). A taken nickname comes
 * back on the field; the PIN clears after a failed try. Success opens the child's hub.
 */
export function AddChildForm() {
  const router = useRouter();
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
        flash(addChildCopy.added(child.nickname));
        router.replace(`/(parent)/children/${child.id}`);
      } catch (cause) {
        setValues((current) => ({ ...current, pin: "" }));
        if (isAppError(cause) && cause.fieldErrors) {
          setFieldErrors(cause.fieldErrors as ChildFieldErrors);
          return;
        }
        setError(await actionErrorMessage(cause));
      }
    });

  return (
    <View className="gap-4">
      <ChildFields copy={addChildCopy} values={values} onChange={setValues} errors={fieldErrors} />
      <Notice message={error} />
      <Button
        size="lg"
        accessibilityLabel={addChildCopy.submit}
        accessibilityState={{ busy: add.isPending, disabled: add.isPending }}
        disabled={add.isPending}
        onPress={() => void submit()}
      >
        {add.isPending ? <ActivityIndicator color="white" /> : <Text>{addChildCopy.submit}</Text>}
      </Button>
      <Button
        variant="outline"
        size="lg"
        accessibilityLabel={addChildCopy.cancel}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(parent)/(tabs)"))}
      >
        <Text>{addChildCopy.cancel}</Text>
      </Button>
    </View>
  );
}

/** The web's /parent/children/new: the intro, the form, and the Jarso notice under it. */
export function AddChildScreen() {
  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-muted-foreground">{addChildCopy.intro}</Text>
      <AddChildForm />
      <JarsoNotice />
    </ScrollView>
  );
}

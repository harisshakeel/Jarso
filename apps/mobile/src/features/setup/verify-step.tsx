import { EMAIL_CODE_LENGTH, emailCodeSchema } from "@jarso/core/auth";
import { setupFlowCopy } from "@jarso/core/setup";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { actionErrorMessage } from "@/lib";
import { SetupFrame, StepHeading } from "./setup-frame";
import { resendEmailCode, verifyEmailCode } from "./sign-up";

const copy = setupFlowCopy.verify;

/** Seconds before another code may be asked for (the hosted `max_frequency`). */
export const RESEND_WAIT_S = 60;

/** Counts down from `RESEND_WAIT_S` each time `restart` changes. */
function useCountdown(restart: number): number {
  const [left, setLeft] = useState(RESEND_WAIT_S);
  // biome-ignore lint/correctness/useExhaustiveDependencies: restarts on each new code only
  useEffect(() => {
    setLeft(RESEND_WAIT_S);
    const timer = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) clearInterval(timer);
        return Math.max(s - 1, 0);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [restart]);
  return left;
}

/**
 * Step 3b, only when the project asks for an email check: the code from the email, typed here.
 * A good code makes a session (the session provider takes it from there). Send again waits a
 * minute between codes. A parent who tapped the email's link instead signs in with the password.
 */
export function VerifyStep({
  email,
  onBack,
  onSignIn,
}: {
  email: string;
  onBack: () => void;
  onSignIn: () => void;
}) {
  const once = useSendOnce();
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(0);
  const wait = useCountdown(sent);

  const submit = () =>
    once(async () => {
      setError(undefined);
      setNote(undefined);
      const parsed = emailCodeSchema.safeParse(code);
      if (!parsed.success) {
        setFieldError(z.flattenError(parsed.error).formErrors[0]);
        return;
      }
      setFieldError(undefined);
      setPending(true);
      try {
        await verifyEmailCode(email, parsed.data);
      } catch (cause) {
        setCode("");
        setError(await actionErrorMessage(cause));
      } finally {
        setPending(false);
      }
    });

  const resend = () =>
    once(async () => {
      setError(undefined);
      setNote(undefined);
      try {
        await resendEmailCode(email);
        setNote(copy.resent);
        setSent((n) => n + 1);
      } catch (cause) {
        setError(await actionErrorMessage(cause));
      }
    });

  return (
    <SetupFrame
      step="account"
      onBack={onBack}
      footer={
        <Button
          variant="keycap"
          size="lg"
          loading={pending}
          accessibilityLabel={copy.submit}
          onPress={() => void submit()}
        >
          <Text>{copy.submit}</Text>
        </Button>
      }
    >
      <StepHeading title={copy.title} line={copy.sent(email)} />
      <Field
        label={copy.code}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={EMAIL_CODE_LENGTH + 3}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        className="font-sans-bold text-h2 tracking-[6px]"
        description={copy.hint}
        errors={fieldError ? [fieldError] : undefined}
      />
      <Notice message={error} />
      {note ? (
        <Text accessibilityLiveRegion="polite" className="text-primary">
          {note}
        </Text>
      ) : null}
      <View className="items-start gap-1">
        <Button
          variant="link"
          size="sm"
          disabled={wait > 0}
          accessibilityLabel={wait > 0 ? copy.wait(wait) : copy.resend}
          onPress={() => void resend()}
        >
          <Text>{wait > 0 ? copy.wait(wait) : copy.resend}</Text>
        </Button>
        <Button variant="link" size="sm" accessibilityLabel={copy.otherEmail} onPress={onBack}>
          <Text>{copy.otherEmail}</Text>
        </Button>
        <View className="flex-row items-center gap-1">
          <Text className="text-ink-2">{copy.confirmed}</Text>
          <Button
            variant="link"
            size="sm"
            accessibilityLabel={`${copy.confirmed} ${setupFlowCopy.account.signIn}`}
            onPress={onSignIn}
          >
            <Text>{setupFlowCopy.account.signIn}</Text>
          </Button>
        </View>
      </View>
    </SetupFrame>
  );
}

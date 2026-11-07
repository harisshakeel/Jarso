import { signUpSchema } from "@jarso/core/auth";
import { setupFlowCopy } from "@jarso/core/setup";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { actionErrorMessage } from "@/lib";
import { SetupFrame, StepHeading } from "./setup-frame";
import { type SignUpOutcome, signUpParent } from "./sign-up";

const copy = setupFlowCopy.account;

type FieldErrors = Partial<Record<"email" | "password" | "fullName", string[]>>;

/**
 * Step 3a: the account, checked with the web's `signUpSchema` (no child-domain address, 8+
 * characters). The password leaves state once it has been sent.
 */
export function AccountStep({
  initialEmail = "",
  onBack,
  onSignedUp,
  onSignIn,
}: {
  initialEmail?: string;
  onBack: () => void;
  onSignedUp: (outcome: SignUpOutcome, email: string) => void;
  onSignIn: () => void;
}) {
  const once = useSendOnce();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = () =>
    once(async () => {
      setError(undefined);
      const parsed = signUpSchema.safeParse({ email: email.trim(), password, fullName });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error).fieldErrors);
        return;
      }
      setFieldErrors(undefined);
      setPending(true);
      try {
        const outcome = await signUpParent(parsed.data);
        setPassword("");
        onSignedUp(outcome, parsed.data.email);
      } catch (cause) {
        setError(await actionErrorMessage(cause));
      } finally {
        setPending(false);
      }
    });

  return (
    <SetupFrame
      step="account"
      onBack={onBack}
      footer={
        <>
          <Button
            variant="keycap"
            size="lg"
            loading={pending}
            accessibilityLabel={copy.submit}
            onPress={() => void submit()}
          >
            <Text>{copy.submit}</Text>
          </Button>
          <Text className="text-center text-small text-muted-foreground">{copy.note}</Text>
        </>
      }
    >
      <StepHeading title={copy.title} />
      <View className="gap-4">
        <Field
          label={copy.email}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          errors={fieldErrors?.email}
        />
        <Field
          label={copy.password}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          description={copy.passwordHelp}
          errors={fieldErrors?.password}
        />
        <Field
          label={copy.name}
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          textContentType="name"
          maxLength={100}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          errors={fieldErrors?.fullName}
        />
      </View>
      <Notice message={error} />
      <View className="flex-row items-center justify-center gap-1">
        <Text className="text-ink-2">{copy.haveAccount}</Text>
        <Button
          variant="link"
          size="sm"
          accessibilityLabel={`${copy.haveAccount} ${copy.signIn}`}
          onPress={onSignIn}
        >
          <Text>{copy.signIn}</Text>
        </Button>
      </View>
    </SetupFrame>
  );
}

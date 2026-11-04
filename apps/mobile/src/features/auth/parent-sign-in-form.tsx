import { signInSchema } from "@jarso/core/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Switch, View } from "react-native";
import { z } from "zod";
import { BodySizeProvider, Button, Label, Text } from "@/components/ui";
import { WEB_SIGNUP_URL } from "@/config";
import { logger, toUserMessage } from "@/lib";
import { Field } from "./form-field";
import { forgetParentSignIn, loadSavedParentSignIn, saveParentSignIn } from "./saved-sign-in";
import { signInParent } from "./sign-in-parent";

const SIGN_UP = "New to Jarso? Create an account on the web";
const REMEMBER = "Remember me on this phone";

type FieldErrors = Partial<Record<"email" | "password", string[]>>;

/**
 * The parent's email sign-in, mirroring web /login: the same labels, schema and one failure line.
 * The email survives a failed try; the password clears. Accounts are created on the web.
 * "Remember me on this phone" (off by default) keeps the email and password in the device
 * keystore and fills them in next time, like the child form.
 */
export function ParentSignInForm({ notice }: { notice?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    let live = true;
    void loadSavedParentSignIn().then((saved) => {
      if (!live || !saved) return;
      setEmail(saved.email);
      setPassword(saved.password);
      setRemember(true);
    });
    return () => {
      live = false;
    };
  }, []);

  function toggleRemember(next: boolean) {
    setRemember(next);
    if (!next) void forgetParentSignIn();
  }

  async function submit() {
    if (pending) return;
    setFormError(undefined);
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors(undefined);
    setPending(true);
    try {
      await signInParent(parsed.data);
      // Signed in either way; a keystore failure only means typing it again next time.
      const details = { email: parsed.data.email, password: parsed.data.password };
      await (remember ? saveParentSignIn(details) : forgetParentSignIn()).catch(() => undefined);
    } catch (error) {
      setFormError(toUserMessage(error));
      setPassword("");
    } finally {
      setPending(false);
    }
  }

  const openSignUp = () =>
    Linking.openURL(WEB_SIGNUP_URL).catch(() => {
      logger.warn("Could not open the web sign-up");
    });

  const message = formError ?? notice;
  return (
    <BodySizeProvider size="parent">
      <View className="gap-6 rounded-2xl bg-card p-6">
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          errors={fieldErrors?.email}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          errors={fieldErrors?.password}
        />
        <View className="min-h-11 flex-row items-center justify-between gap-4">
          <Label nativeID="parent-remember-label" onPress={() => toggleRemember(!remember)}>
            {REMEMBER}
          </Label>
          <Switch
            accessibilityLabel={REMEMBER}
            aria-labelledby="parent-remember-label"
            value={remember}
            onValueChange={toggleRemember}
          />
        </View>
        {message ? (
          <Text accessibilityRole="alert" className="text-destructive">
            {message}
          </Text>
        ) : null}
        <Button
          size="lg"
          accessibilityLabel="Sign in"
          accessibilityState={{ busy: pending, disabled: pending }}
          disabled={pending}
          onPress={() => void submit()}
        >
          {pending ? <ActivityIndicator color="white" /> : <Text>Sign in</Text>}
        </Button>
        <Button
          variant="link"
          accessibilityRole="link"
          accessibilityLabel={SIGN_UP}
          onPress={() => void openSignUp()}
        >
          <Text className="text-center">{SIGN_UP}</Text>
        </Button>
      </View>
    </BodySizeProvider>
  );
}

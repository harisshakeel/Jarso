import { childSignInCopy, childSignInSchema } from "@jarso/core/family";
import { useEffect, useState } from "react";
import { ActivityIndicator, Switch, View } from "react-native";
import { z } from "zod";
import { Button, Label, Text } from "@/components/ui";
import { toUserMessage } from "@/lib";
import { Field } from "./form-field";
import { forgetSignIn, loadSavedSignIn, saveSignIn } from "./saved-sign-in";
import { signInChild } from "./sign-in-child";

const REMEMBER = "Remember me on this phone";

type FieldName = "familyCode" | "nickname" | "pin";
type FieldErrors = Partial<Record<FieldName, string[]>>;

/**
 * The child's PIN sign-in, mirroring web /sign-in/child: the same labels, limits and Zod schema.
 * Code and nickname survive a wrong PIN; the PIN clears. "Remember me on this phone" (off by
 * default) keeps all three in the device keystore and fills them in next time.
 */
export function SignInForm({ notice }: { notice?: string }) {
  const [familyCode, setFamilyCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    let live = true;
    void loadSavedSignIn().then((saved) => {
      if (!live || !saved) return;
      setFamilyCode(saved.familyCode);
      setNickname(saved.nickname);
      setPin(saved.pin);
      setRemember(true);
    });
    return () => {
      live = false;
    };
  }, []);

  function toggleRemember(next: boolean) {
    setRemember(next);
    if (!next) void forgetSignIn();
  }

  async function submit() {
    if (pending) return;
    setFormError(undefined);
    const parsed = childSignInSchema.safeParse({ familyCode, nickname, pin });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors(undefined);
    setPending(true);
    try {
      await signInChild(parsed.data);
      // Signed in either way; a keystore failure only means typing it again next time.
      await (remember ? saveSignIn(parsed.data) : forgetSignIn()).catch(() => undefined);
    } catch (error) {
      setFormError(toUserMessage(error));
      setPin("");
    } finally {
      setPending(false);
    }
  }

  const message = formError ?? notice;
  return (
    <View className="gap-6 rounded-2xl bg-card p-6">
      <Field
        label="Family code"
        value={familyCode}
        onChangeText={(text) => setFamilyCode(text.toUpperCase())}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        maxLength={16}
        className="font-sans-bold tracking-widest"
        description={childSignInCopy.familyCodeHint}
        errors={fieldErrors?.familyCode}
      />
      <Field
        label="Your nickname"
        value={nickname}
        onChangeText={setNickname}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        maxLength={20}
        errors={fieldErrors?.nickname}
      />
      <Field
        label="Your PIN"
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        autoComplete="off"
        maxLength={6}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        errors={fieldErrors?.pin}
      />
      <View className="min-h-11 flex-row items-center justify-between gap-4">
        <Label nativeID="remember-label" onPress={() => toggleRemember(!remember)}>
          {REMEMBER}
        </Label>
        <Switch
          accessibilityLabel={REMEMBER}
          aria-labelledby="remember-label"
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
    </View>
  );
}

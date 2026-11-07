import {
  type ChildSignInLink,
  childScanCopy,
  childSignInCopy,
  childSignInSchema,
} from "@jarso/core/family";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { z } from "zod";
import { Button, Label, Switch, Text } from "@/components/ui";
import { toUserMessage } from "@/lib";
import { Field } from "./form-field";
import { PinPad } from "./pin-pad";
import { forgetSignIn, loadSavedSignIn, saveSignIn } from "./saved-sign-in";
import { ScanCode } from "./scan-code";
import { signInChild } from "./sign-in-child";

const REMEMBER = "Remember me on this phone";

type FieldName = "familyCode" | "nickname" | "pin";
type FieldErrors = Partial<Record<FieldName, string[]>>;

/**
 * The child's PIN sign-in, mirroring web /sign-in/child: the same labels, limits and Zod schema.
 * "Scan the code" first (the parent's share-card QR fills in the code and nickname), then the
 * PIN on a big pad. Code and nickname survive a wrong PIN; the PIN clears. "Remember me on this
 * phone" (off by default) keeps all three in the device keystore and fills them in next time.
 * `initial` comes from a sign-in link and wins over what was remembered for someone else.
 */
export function SignInForm({ notice, initial }: { notice?: string; initial?: ChildSignInLink }) {
  const [familyCode, setFamilyCode] = useState(initial?.familyCode ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const [pin, setPin] = useState("");
  const [scanned, setScanned] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    let live = true;
    void loadSavedSignIn().then((saved) => {
      if (!live || !saved) return;
      // A link for another child keeps its own details; a saved PIN belongs to its own child.
      if (
        initial &&
        (initial.familyCode !== saved.familyCode ||
          initial.nickname.toLowerCase() !== saved.nickname.toLowerCase())
      ) {
        return;
      }
      setFamilyCode(saved.familyCode);
      setNickname(saved.nickname);
      setPin(saved.pin);
      setRemember(true);
    });
    return () => {
      live = false;
    };
  }, [initial]);

  function fillFromScan(details: ChildSignInLink) {
    setFamilyCode(details.familyCode);
    setNickname(details.nickname);
    setPin("");
    setScanned(true);
    setFieldErrors(undefined);
  }

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
      <ScanCode onScanned={fillFromScan} />
      {scanned ? (
        <Text accessibilityLiveRegion="polite" className="text-center font-sans-bold text-primary">
          {childScanCopy.filled}
        </Text>
      ) : null}
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
      <PinPad value={pin} onChange={setPin} errors={fieldErrors?.pin} />
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
        variant="keycap"
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

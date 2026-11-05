import {
  type ChildSummary,
  familySettingsCopy,
  nicknameTaken,
  renameChildSchema,
  setChildPinSchema,
} from "@jarso/core/family";
import { useState } from "react";
import { ActivityIndicator, Modal, View } from "react-native";
import { z } from "zod";
import { Button, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { useRemoveChild, useRenameChild, useSetChildPin } from "@/features/family";
import { actionErrorMessage, flash, isAppError } from "@/lib";

// One child's account forms (the web's ChildrenSettingsList row), used by the child's settings
// page: a new nickname and a new PIN open in place under their row; remove asks first.

function Submit({
  label,
  pending,
  onPress,
}: {
  label: string;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={label}
      accessibilityState={{ busy: pending, disabled: pending }}
      disabled={pending}
      onPress={onPress}
    >
      {pending ? <ActivityIndicator color="white" /> : <Text>{label}</Text>}
    </Button>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" className="text-destructive">
      {message}
    </Text>
  );
}

export function RenameForm({ child, onDone }: { child: ChildSummary; onDone: () => void }) {
  const rename = useRenameChild();
  const [nickname, setNickname] = useState(child.nickname);
  const [fieldError, setFieldError] = useState<string[]>();
  const [formError, setFormError] = useState<string>();

  async function submit() {
    if (rename.isPending) return;
    setFormError(undefined);
    const parsed = renameChildSchema.safeParse({ childId: child.id, nickname });
    if (!parsed.success) {
      setFieldError(z.flattenError(parsed.error).fieldErrors.nickname);
      return;
    }
    setFieldError(undefined);
    try {
      await rename.mutateAsync(parsed.data);
      flash(familySettingsCopy.renamed);
      onDone();
    } catch (error) {
      // A nickname another child has: on the field, as the web's withNicknameConflict.
      if (isAppError(error) && error.code === "CONFLICT") setFieldError([nicknameTaken]);
      else setFormError(await actionErrorMessage(error));
    }
  }

  return (
    <View className="gap-3">
      <Text className="font-sans-bold">{familySettingsCopy.renameTitle(child.nickname)}</Text>
      <Text className="text-muted-foreground">{familySettingsCopy.renameBody(child.nickname)}</Text>
      <Field
        label={familySettingsCopy.nickname}
        description={familySettingsCopy.nicknameHelp}
        value={nickname}
        onChangeText={setNickname}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        errors={fieldError}
      />
      <FormError message={formError} />
      <Submit
        label={familySettingsCopy.saveNickname}
        pending={rename.isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}

export function PinForm({ child, onDone }: { child: ChildSummary; onDone: () => void }) {
  const setPin = useSetChildPin();
  const [pin, setPinValue] = useState("");
  const [fieldError, setFieldError] = useState<string[]>();
  const [formError, setFormError] = useState<string>();

  async function submit() {
    if (setPin.isPending) return;
    setFormError(undefined);
    const parsed = setChildPinSchema.safeParse({ childId: child.id, pin });
    if (!parsed.success) {
      setFieldError(z.flattenError(parsed.error).fieldErrors.pin);
      return;
    }
    setFieldError(undefined);
    try {
      await setPin.mutateAsync(parsed.data);
      flash(familySettingsCopy.pinUpdated(child.nickname));
      onDone();
    } catch (error) {
      setFormError(await actionErrorMessage(error));
    }
  }

  return (
    <View className="gap-3">
      <Text className="font-sans-bold">{familySettingsCopy.pinTitle(child.nickname)}</Text>
      <Text className="text-muted-foreground">{familySettingsCopy.pinBody(child.nickname)}</Text>
      <Field
        label={familySettingsCopy.newPin}
        description={familySettingsCopy.pinHelp}
        value={pin}
        onChangeText={setPinValue}
        keyboardType="number-pad"
        secureTextEntry
        autoComplete="off"
        maxLength={6}
        errors={fieldError}
      />
      <FormError message={formError} />
      <Submit
        label={familySettingsCopy.savePin}
        pending={setPin.isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}

/**
 * Asks before removing; a failure keeps the dialog open with the error (nothing was removed).
 * Once the child is removed, `onRemoved` runs instead of `onClose` (the page leaves).
 */
export function RemoveDialog({
  child,
  onClose,
  onRemoved,
}: {
  child: ChildSummary;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const remove = useRemoveChild();
  const [error, setError] = useState<string>();

  async function confirm() {
    if (remove.isPending) return;
    setError(undefined);
    try {
      await remove.mutateAsync(child.id);
      flash(familySettingsCopy.removed(child.nickname));
      onRemoved();
    } catch (cause) {
      setError(await actionErrorMessage(cause));
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center bg-black/50 px-6">
        <View accessibilityViewIsModal className="gap-4 rounded-2xl bg-card p-5">
          <Text accessibilityRole="header" className="font-sans-bold text-h3">
            {familySettingsCopy.removeTitle(child.nickname)}
          </Text>
          <Text className="text-muted-foreground">
            {familySettingsCopy.removeBody(child.nickname)}
          </Text>
          <FormError message={error} />
          <Button
            variant="destructive"
            accessibilityLabel={familySettingsCopy.removeChild(child.nickname)}
            accessibilityState={{ busy: remove.isPending, disabled: remove.isPending }}
            disabled={remove.isPending}
            onPress={() => void confirm()}
          >
            {remove.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text>{familySettingsCopy.removeChild(child.nickname)}</Text>
            )}
          </Button>
          <Button
            variant="outline"
            accessibilityLabel={familySettingsCopy.keepChild(child.nickname)}
            disabled={remove.isPending}
            onPress={onClose}
          >
            <Text>{familySettingsCopy.keepChild(child.nickname)}</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}

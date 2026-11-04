import { childNoteSchema, NOTE_MAX, noteCopy } from "@jarso/core/notifications";
import { insertChildNote } from "@jarso/data/notifications";
import { useMutation } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { MessageCircleHeartIcon } from "lucide-react-native";
import { useState } from "react";
import { Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { KeyboardScrollView } from "@/components/screen";
import { Notice, SubmitButton, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { actionErrorMessage, flash, useTokens } from "@/lib";
import { dispatchNotices } from "@/lib/notices";
import { supabase } from "@/lib/supabase/client";

/** Sends a note to the child's Notifications (`send_child_note`; a repeated key sends nothing new). */
export function useSendNote() {
  return useMutation({
    mutationFn: (input: { childId: string; text: string; idempotencyKey: string }) =>
      insertChildNote(supabase, input),
    onSuccess: () => dispatchNotices(),
  });
}

/**
 * "Send a note" (the web's SendNoteSheet): a short note from the parent that lands in the child's
 * Notifications. The trigger opens a sheet; nothing is sent until the parent taps Send.
 */
export function SendNoteSheet({ childId, nickname }: { childId: string; nickname: string }) {
  const tokens = useTokens();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        className="flex-row gap-1.5 self-start px-2"
        accessibilityLabel={`${noteCopy.trigger} ${noteCopy.triggerTo(nickname)}`}
        onPress={() => setOpen(true)}
      >
        <MessageCircleHeartIcon size={18} color={tokens.primary} />
        <Text className="text-primary">{noteCopy.trigger}</Text>
      </Button>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        {/* Inside the modal, so it mounts on every opening with a new key. */}
        {open ? (
          <NoteForm childId={childId} nickname={nickname} onDone={() => setOpen(false)} />
        ) : null}
      </Modal>
    </>
  );
}

function NoteForm({
  childId,
  nickname,
  onDone,
}: {
  childId: string;
  nickname: string;
  onDone: () => void;
}) {
  // One key per opening: sending again after an error reuses it, so the child gets one note.
  const [idempotencyKey] = useState(() => randomUUID());
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const send = useSendNote();
  const once = useSendOnce();

  const submit = () =>
    once(async () => {
      setError(undefined);
      const parsed = childNoteSchema.safeParse({ childId, text, idempotencyKey });
      if (!parsed.success) {
        setFieldError(z.flattenError(parsed.error).fieldErrors.text?.[0]);
        return;
      }
      setFieldError(undefined);
      try {
        await send.mutateAsync(parsed.data);
        flash(noteCopy.sent(nickname));
        onDone();
      } catch (cause) {
        setError(await actionErrorMessage(cause));
      }
    });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardScrollView contentContainerClassName="gap-4 p-6" keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text accessibilityRole="header" className="font-sans-bold text-h3">
            {noteCopy.title(nickname)}
          </Text>
          <Text className="text-muted-foreground">{noteCopy.body(nickname)}</Text>
        </View>
        <Field
          label={noteCopy.label}
          value={text}
          onChangeText={setText}
          maxLength={NOTE_MAX}
          autoComplete="off"
          description={noteCopy.count(text.length, NOTE_MAX)}
          errors={fieldError ? [fieldError] : undefined}
        />
        <Notice message={error} />
        <SubmitButton
          label={noteCopy.send(nickname)}
          pending={send.isPending}
          onPress={() => void submit()}
        />
        <Button variant="ghost" accessibilityLabel="Cancel" onPress={onDone}>
          <Text>Cancel</Text>
        </Button>
      </KeyboardScrollView>
    </SafeAreaView>
  );
}

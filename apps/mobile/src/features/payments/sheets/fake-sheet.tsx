import { paymentCopy } from "@jarso/core/payments";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, Modal, View } from "react-native";
import { Notice } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { actionErrorMessage } from "@/lib";
import { completeFakeSheet } from "../api";
import type { FakeSheet, SheetOutcome } from "./types";

type Open = { sheet: FakeSheet; resolve: (outcome: SheetOutcome) => void };
type Choice = { label: string; outcome: "pay" | "fail" | "ok" | "decline" };

const choicesFor = (mode: FakeSheet["mode"]): Choice[] =>
  mode === "payment"
    ? [
        { label: paymentCopy.fakePay, outcome: "pay" },
        { label: paymentCopy.fakeDecline, outcome: "fail" },
      ]
    : [
        { label: paymentCopy.fakeSaveOk, outcome: "ok" },
        { label: paymentCopy.fakeSaveDecline, outcome: "decline" },
      ];

/**
 * The fake provider's test card (dev builds only; `presentSheet` refuses it elsewhere). A choice
 * goes through the server's fake completion, the same path as the fake webhook, so the phone
 * still never marks anything paid itself. Render `element` once; `open` resolves when the
 * dialog closes.
 */
export function useFakeSheet(): {
  element: ReactNode;
  open: (sheet: FakeSheet) => Promise<SheetOutcome>;
} {
  const [current, setCurrent] = useState<Open | null>(null);
  const [busy, setBusy] = useState<Choice["outcome"] | null>(null);
  const [error, setError] = useState<string>();

  const open = (sheet: FakeSheet) =>
    new Promise<SheetOutcome>((resolve) => {
      setError(undefined);
      setBusy(null);
      setCurrent({ sheet, resolve });
    });

  function close(outcome: SheetOutcome) {
    current?.resolve(outcome);
    setCurrent(null);
    setBusy(null);
  }

  async function choose(choice: Choice) {
    if (!current || busy) return;
    setError(undefined);
    setBusy(choice.outcome);
    const { mode, ref } = current.sheet;
    try {
      await completeFakeSheet(
        mode === "payment"
          ? { mode, ref, outcome: choice.outcome === "pay" ? "pay" : "fail" }
          : { mode, ref, outcome: choice.outcome === "ok" ? "ok" : "decline" },
      );
      close("completed");
    } catch (cause) {
      setBusy(null);
      setError(await actionErrorMessage(cause));
    }
  }

  const element = current ? (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) close("closed");
      }}
    >
      <View className="flex-1 justify-center bg-black/50 px-6">
        <View accessibilityViewIsModal className="gap-4 rounded-2xl bg-card p-5">
          <Text accessibilityRole="header" className="font-sans-bold text-h3">
            {paymentCopy.fakeTitle}
          </Text>
          <Text className="text-muted-foreground">{paymentCopy.fakeDetail}</Text>
          <Notice message={error} />
          {choicesFor(current.sheet.mode).map((choice) => (
            <Button
              key={choice.outcome}
              variant={choice.outcome === "pay" || choice.outcome === "ok" ? "default" : "outline"}
              accessibilityLabel={choice.label}
              accessibilityState={{ busy: busy === choice.outcome, disabled: busy !== null }}
              disabled={busy !== null}
              onPress={() => void choose(choice)}
            >
              {busy === choice.outcome ? <ActivityIndicator /> : <Text>{choice.label}</Text>}
            </Button>
          ))}
          <Button
            variant="ghost"
            accessibilityLabel={paymentCopy.goBack}
            accessibilityState={{ disabled: busy !== null }}
            disabled={busy !== null}
            onPress={() => close("closed")}
          >
            <Text>{paymentCopy.goBack}</Text>
          </Button>
        </View>
      </View>
    </Modal>
  ) : null;

  return { element, open };
}

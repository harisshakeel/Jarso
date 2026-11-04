import { type PaymentProviderId, paymentCopy, type SavedCard } from "@jarso/core/payments";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import { Card } from "@/components/screen";
import { Notice } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { actionErrorMessage, flash } from "@/lib";
import { keys } from "@/lib/query";
import { removeCard } from "./api";
import { usePaymentProviders } from "./use-payment-providers";

/**
 * The parent's saved cards in settings (mockup J), the web's `SavedCards`: one row per saved
 * card with its provider, and Remove behind a confirm (auto charge that uses it turns off).
 * Cards are only saved by turning auto charge on. Renders nothing when card payments are off.
 */
export function SavedCardsSlot() {
  const providers = usePaymentProviders();
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<PaymentProviderId | null>(null);
  const [error, setError] = useState<string>();

  const cards = providers.data?.cards;
  if (!cards || cards.length === 0) return null;
  const saved: SavedCard[] = cards.map(({ provider, label, card }) => ({ provider, label, card }));
  const withCard = saved.filter((entry) => entry.card !== null);

  async function remove(provider: PaymentProviderId) {
    setRemoving(provider);
    setError(undefined);
    try {
      await removeCard(provider);
      flash(paymentCopy.removed);
      void queryClient.invalidateQueries({ queryKey: keys.payments() });
    } catch (cause) {
      setError(await actionErrorMessage(cause));
    } finally {
      setRemoving(null);
    }
  }

  function confirm(provider: PaymentProviderId) {
    if (removing) return;
    Alert.alert(paymentCopy.removeTitle, paymentCopy.removeDetail, [
      { text: paymentCopy.keepCard, style: "cancel" },
      { text: paymentCopy.remove, style: "destructive", onPress: () => void remove(provider) },
    ]);
  }

  return (
    <Card>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {paymentCopy.savedCardTitle(saved)}
      </Text>
      {withCard.length === 0 ? (
        <Text className="text-muted-foreground">{paymentCopy.noCard}</Text>
      ) : (
        withCard.map(({ provider, label, card }) => {
          if (!card) return null;
          const name = paymentCopy.cardEnding(card.brand, card.last4);
          return (
            <View key={provider} className="min-h-12 flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="font-sans-bold">{name}</Text>
                <Text className="text-muted-foreground text-small">{label}</Text>
              </View>
              <Button
                variant="outline"
                size="sm"
                className="h-12"
                accessibilityLabel={`${paymentCopy.removeCard}, ${name}`}
                accessibilityState={{ busy: removing === provider, disabled: removing !== null }}
                disabled={removing !== null}
                onPress={() => confirm(provider)}
              >
                <Text>{paymentCopy.remove}</Text>
              </Button>
            </View>
          );
        })
      )}
      <Notice message={error} />
    </Card>
  );
}

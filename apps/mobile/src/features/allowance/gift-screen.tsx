import { allowanceErrors, type Gift, giftCopy } from "@jarso/core/allowance";
import { parentPageCopy } from "@jarso/core/dashboard";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { KeyboardScrollView } from "@/components/screen";
import { HomeWait } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { useFamily } from "@/features/family";
import { AutoChargeSlot } from "@/features/payments";
import { flash } from "@/lib";
import { CancelGiftButton, GiftForm } from "./gift-form";
import { useFamilyContext } from "./use-allowance-mutations";
import { useChildGifts } from "./use-gifts";

/**
 * A new gift (no `giftId`), or a change to a pending one with auto charge and Cancel. A gift no
 * longer pending when the screen opens says so and goes back.
 */
export function GiftScreen({
  childId,
  giftId,
  defaultAmount,
}: {
  childId: string;
  giftId?: string;
  /** Amount carried over from the allowance form's "One time". */
  defaultAmount?: string;
}) {
  const router = useRouter();
  const family = useFamily();
  const context = useFamilyContext();
  const gifts = useChildGifts(childId);
  const child = family.data?.children.find((item) => item.id === childId);
  const back = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace(`/(parent)/children/${childId}`)),
    [router, childId],
  );
  // The gift as it was when the screen opened: this screen's own save or cancel drops it from
  // the list afterwards, which must not read as "already handed over or cancelled".
  const [gift, setGift] = useState<Gift | null>();
  useEffect(() => {
    if (!giftId || !gifts.data || gift !== undefined) return;
    const found = gifts.data.find((item) => item.id === giftId && item.status === "pending");
    setGift(found ?? null);
    if (!found) {
      flash(allowanceErrors.giftDone);
      back();
    }
  }, [giftId, gifts.data, gift, back]);

  const editing = Boolean(giftId);
  if (!child || !context.data || (editing && !gift)) {
    return (
      <HomeWait
        error={family.error ?? context.error ?? (editing ? gifts.error : null)}
        onClose={back}
      />
    );
  }

  const { currency, today } = context.data;
  return (
    <KeyboardScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-muted-foreground">
        {gift ? parentPageCopy.giftEditIntro : parentPageCopy.giftNewIntro}
      </Text>
      <GiftForm
        childId={childId}
        nickname={child.nickname}
        currency={currency}
        today={today}
        initial={gift ?? undefined}
        defaultAmount={defaultAmount}
        onDone={back}
      />
      {gift ? (
        <>
          <AutoChargeSlot target={{ kind: "gift", id: gift.id }} />
          <CancelGiftButton
            childId={childId}
            giftId={gift.id}
            nickname={child.nickname}
            onDone={back}
          />
        </>
      ) : null}
      <Button variant="ghost" accessibilityLabel={giftCopy.back} onPress={back}>
        <Text>{giftCopy.back}</Text>
      </Button>
    </KeyboardScrollView>
  );
}

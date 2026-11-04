import { parentPageCopy } from "@jarso/core/dashboard";
import { useLocalSearchParams } from "expo-router";
import { GiftScreen } from "@/features/allowance";
import { ChildPage } from "@/features/parent";

/** A new one-time gift. `amount` comes from the allowance form's "One time". */
export default function NewGiftRoute() {
  const { childId, amount } = useLocalSearchParams<{ childId: string; amount?: string }>();
  return (
    <ChildPage childId={childId} title={(child) => parentPageCopy.giftFor(child.nickname)}>
      <GiftScreen childId={childId} defaultAmount={amount} />
    </ChildPage>
  );
}

import { parentPageCopy } from "@jarso/core/dashboard";
import { useLocalSearchParams } from "expo-router";
import { GiftScreen } from "@/features/allowance";
import { ChildPage } from "@/features/parent";

/** Change or cancel a gift that hasn't been handed over. */
export default function EditGiftRoute() {
  const { childId, giftId } = useLocalSearchParams<{ childId: string; giftId: string }>();
  return (
    <ChildPage childId={childId} title={(child) => parentPageCopy.giftFor(child.nickname)}>
      <GiftScreen childId={childId} giftId={giftId} />
    </ChildPage>
  );
}

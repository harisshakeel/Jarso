import { parentPageCopy } from "@jarso/core/dashboard";
import { useLocalSearchParams } from "expo-router";
import { AllowanceScreen } from "@/features/allowance";
import { ChildPage } from "@/features/parent";

/** One child's allowance: set it up, or change, pause, resume or stop it. */
export default function ChildAllowanceRoute() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return (
    <ChildPage childId={childId} title={(child) => parentPageCopy.allowanceFor(child.nickname)}>
      <AllowanceScreen childId={childId} />
    </ChildPage>
  );
}

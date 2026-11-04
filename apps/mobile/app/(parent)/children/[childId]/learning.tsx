import { parentPageCopy } from "@jarso/core/dashboard";
import { useLocalSearchParams } from "expo-router";
import { LearningSummary } from "@/features/learning";
import { ChildPage } from "@/features/parent";

/** One child's learning for a parent, read only. */
export default function ChildLearningRoute() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return (
    <ChildPage childId={childId} title={(child) => parentPageCopy.learning(child.nickname)}>
      <LearningSummary childId={childId} />
    </ChildPage>
  );
}

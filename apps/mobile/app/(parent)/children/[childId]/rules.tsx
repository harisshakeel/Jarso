import { rulesCopy } from "@jarso/core/rules";
import { useLocalSearchParams } from "expo-router";
import { ChildPage } from "@/features/parent";
import { RulesForm } from "@/features/rules";

/** One child's money rules. */
export default function ChildRulesRoute() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return (
    <ChildPage childId={childId} title={() => rulesCopy.title}>
      <RulesForm childId={childId} />
    </ChildPage>
  );
}

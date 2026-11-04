import { parentPageCopy } from "@jarso/core/dashboard";
import { useLocalSearchParams } from "expo-router";
import { HistoryList } from "@/features/history";
import { ChildPage } from "@/features/parent";

/** One child's full history for a parent: where it went this week, then every line, read only. */
export default function ChildHistoryRoute() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return (
    <ChildPage childId={childId} title={(child) => parentPageCopy.history(child.nickname)}>
      <HistoryList childId={childId} readOnly />
    </ChildPage>
  );
}

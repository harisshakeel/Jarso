import { parentPageCopy } from "@jarso/core/dashboard";
import { useLocalSearchParams } from "expo-router";
import { ChildGuideScreen, ChildPage } from "@/features/parent";

/** One child's Jarso chats and memories, for their parent. */
export default function ChildGuideRoute() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return (
    <ChildPage childId={childId} title={(child) => parentPageCopy.chats(child.nickname)}>
      <ChildGuideScreen childId={childId} />
    </ChildPage>
  );
}

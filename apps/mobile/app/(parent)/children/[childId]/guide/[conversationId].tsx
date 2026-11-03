import { useLocalSearchParams } from "expo-router";
import { ChildGuideChatScreen } from "@/features/parent";

/** One of a child's Jarso chats, as their parent reads it. The screen titles itself. */
export default function ChildGuideChatRoute() {
  const { childId, conversationId } = useLocalSearchParams<{
    childId: string;
    conversationId: string;
  }>();
  return <ChildGuideChatScreen childId={childId} conversationId={conversationId} />;
}

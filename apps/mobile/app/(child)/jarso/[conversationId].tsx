import { useLocalSearchParams } from "expo-router";
import { JarsoChatScreen } from "@/features/guide";

export default function JarsoChatRoute() {
  const { conversationId, draft } = useLocalSearchParams<{
    conversationId: string;
    draft?: string;
  }>();
  return <JarsoChatScreen key={conversationId} conversationId={conversationId} draft={draft} />;
}

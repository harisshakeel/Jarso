import { useLocalSearchParams } from "expo-router";
import { JarsoChatScreen } from "@/features/guide";

export default function JarsoChatRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <JarsoChatScreen key={conversationId} conversationId={conversationId} />;
}

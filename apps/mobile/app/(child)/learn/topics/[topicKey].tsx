import { useLocalSearchParams } from "expo-router";
import { TopicScreen } from "@/features/learn";

export default function TopicRoute() {
  const { topicKey, from } = useLocalSearchParams<{ topicKey: string; from?: string }>();
  return <TopicScreen key={`${topicKey}:${from ?? ""}`} topicKey={topicKey} from={from} />;
}

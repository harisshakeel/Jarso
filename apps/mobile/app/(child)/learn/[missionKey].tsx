import { useLocalSearchParams } from "expo-router";
import { MissionScreen } from "@/features/learn";

export default function MissionRoute() {
  const { missionKey } = useLocalSearchParams<{ missionKey: string }>();
  return <MissionScreen key={missionKey} missionKey={missionKey} />;
}

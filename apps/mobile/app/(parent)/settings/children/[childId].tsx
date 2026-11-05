import { useLocalSearchParams } from "expo-router";
import { ChildSettingsScreen } from "@/features/parent";

/** One child's settings, from Settings (not the child's hub at /children/[childId]). */
export default function ChildSettingsRoute() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return <ChildSettingsScreen childId={childId} />;
}

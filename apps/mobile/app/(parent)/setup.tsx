import { useLocalSearchParams } from "expo-router";
import { SetupScreen } from "@/features/setup";

/** Setup: the parent's details, then the family. The `(parent)` gate sends every screen here first. */
export default function ParentSetup() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  return <SetupScreen next={next} />;
}

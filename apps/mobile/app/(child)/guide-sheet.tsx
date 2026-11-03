import { useLocalSearchParams } from "expo-router";
import { GuideSheetScreen } from "@/features/guide";

export default function GuideSheetRoute() {
  const { context } = useLocalSearchParams<{ context?: string }>();
  return <GuideSheetScreen context={context} />;
}

import { jarPageCopy } from "@jarso/core/ledger";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useGoal } from "@/features/goals";
import { JarScreen } from "@/features/jars";

/** `/(child)/jar/spend` and `/(child)/jar/save`; anything else goes back to Home. */
export default function JarRoute() {
  const { jar } = useLocalSearchParams<{ jar: string }>();
  const goal = useGoal();
  if (jar !== "spend" && jar !== "save") return <Redirect href="/(child)/(tabs)" />;
  return (
    <>
      <Stack.Screen options={{ title: jarPageCopy.title[jar] }} />
      <JarScreen jar={jar} goalTargetMinor={goal.data?.goal.targetMinor ?? null} />
    </>
  );
}

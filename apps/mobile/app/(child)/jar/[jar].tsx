import { jarPageCopy } from "@jarso/core/ledger";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { JarScreen } from "@/features/jars";

/** `/(child)/jar/spend` and `/(child)/jar/save`; anything else goes back to Home. */
export default function JarRoute() {
  const { jar } = useLocalSearchParams<{ jar: string }>();
  if (jar !== "spend" && jar !== "save") return <Redirect href="/(child)/(tabs)" />;
  return (
    <>
      <Stack.Screen options={{ title: jarPageCopy.title[jar] }} />
      <JarScreen jar={jar} />
    </>
  );
}

import { Stack, useLocalSearchParams } from "expo-router";
import { ChildHubScreen, useChild } from "@/features/parent";

/** One child's hub, titled with their nickname. */
export default function ChildRoute() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  return (
    <>
      {child ? <Stack.Screen options={{ title: child.nickname }} /> : null}
      <ChildHubScreen childId={childId} />
    </>
  );
}

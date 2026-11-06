import { goalCopy } from "@jarso/core/goals";
import { Stack } from "expo-router";
import { GoalScreen } from "@/features/goals";

export default function GoalRoute() {
  return (
    <>
      <Stack.Screen options={{ title: goalCopy.page.heading }} />
      <GoalScreen />
    </>
  );
}

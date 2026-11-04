import type { ChildSummary } from "@jarso/core/family";
import { Redirect, Stack } from "expo-router";
import type { ReactNode } from "react";
import { useFamily } from "@/features/family";
import { useChild } from "./use-child";

/**
 * A page under one child (history, learning, rules): titled from the child's nickname once the
 * family has loaded, and back to Children for an id that is not one of the parent's children.
 */
export function ChildPage({
  childId,
  title,
  children,
}: {
  childId: string;
  title: (child: ChildSummary) => string;
  children: ReactNode;
}) {
  const family = useFamily();
  const child = useChild(childId);
  if (family.data && !child) return <Redirect href="/(parent)/(tabs)/children" />;
  return (
    <>
      {child ? <Stack.Screen options={{ title: title(child) }} /> : null}
      {children}
    </>
  );
}

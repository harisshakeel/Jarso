import { useEffect, useRef } from "react";
import { View } from "react-native";
import { type Celebration, useCelebrate } from "@/components/celebrate";

/**
 * What a flow screen shows once its request went: the celebration fires once on mount, over an
 * empty background (the celebration's own button leaves the flow). `onShown` runs right after.
 */
export function SentCelebration({
  celebration,
  onShown,
}: {
  celebration: Celebration;
  onShown?: () => void;
}) {
  const celebrate = useCelebrate();
  const fired = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, whatever re-renders follow
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    celebrate(celebration);
    onShown?.();
  }, []);
  return <View className="flex-1 bg-background" />;
}

import { handoverParamsSchema } from "@jarso/core/allowance";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { HandoverSheet } from "@/features/allowance";

/** "Hand over" (a sheet). Mounts fresh on every open, so each opening gets its own idempotency key. */
export default function HandoverRoute() {
  const router = useRouter();
  const { childId, ...rest } = useLocalSearchParams<{
    childId: string;
    kind: string;
    id: string;
  }>();
  const params = handoverParamsSchema.safeParse(rest);
  const close = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace(`/(parent)/children/${childId}`)),
    [router, childId],
  );
  // A link that names no real item has nothing to hand over: the child's hub instead.
  if (!params.success) return <Redirect href={`/(parent)/children/${childId}`} />;
  return (
    <SafeAreaView className="flex-1 bg-background">
      <HandoverSheet
        childId={childId}
        kind={params.data.kind}
        id={params.data.id}
        onClose={close}
      />
    </SafeAreaView>
  );
}

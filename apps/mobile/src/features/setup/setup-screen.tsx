import { safeNextPath } from "@jarso/core/auth";
import type { ChildSummary } from "@jarso/core/family";
import { type Href, Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { homeFor, UnavailableNotice, useSession } from "@/features/auth";
import { AboutStep } from "./about-step";
import { ChildStep } from "./child-step";
import { FamilyStep } from "./family-step";
import { FreedomStep } from "./freedom-step";
import { PocketMoneyStep } from "./pocket-money-step";
import { SetupFrame } from "./setup-frame";
import { ShareStep } from "./share-step";
import { useParentSetup } from "./use-setup";

/** Steps 4–7, once the family exists. Each carries the child added in step 4 (never the PIN). */
type After =
  | { name: "child" }
  | { name: "money"; child: ChildSummary }
  | { name: "freedom"; child: ChildSummary }
  | { name: "share"; child: ChildSummary };

function SignOutLink() {
  const { signOut } = useSession();
  return (
    <Button
      variant="link"
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      onPress={() => void signOut()}
    >
      <Text>Sign out</Text>
    </Button>
  );
}

/**
 * The parent's setup on the phone, from step 3's "About you" on: their details and what the
 * children call them, then the family (the only steps ADR 0008 requires, showing whichever is
 * missing). A family made in this run goes on to add a child, pocket money, freedom and the share
 * card; otherwise, and always with a `next` (an invite link opened before setup), it replaces
 * itself with `next` or Family as soon as both are done.
 */
export function SetupScreen({ next }: { next?: string }) {
  const router = useRouter();
  const { data, isError, refetch } = useParentSetup();
  // Whether this screen opened before the family existed (decided on the first read).
  const [fresh, setFresh] = useState<boolean | null>(null);
  const [after, setAfter] = useState<After>({ name: "child" });

  // The gate already waits for this read; this covers opening /setup directly.
  if (!data) {
    if (isError) return <UnavailableNotice onRetry={() => void refetch()} />;
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  const isFresh = fresh ?? (!next && data.familyId === null);
  if (fresh === null) setFresh(isFresh);

  const home = safeNextPath(next, homeFor("parent") as string) as Href;
  if (!data.profileComplete) {
    return (
      <AboutStep>
        <SignOutLink />
      </AboutStep>
    );
  }
  if (!data.familyId) {
    return (
      <SetupFrame step="account">
        <FamilyStep />
        <SignOutLink />
      </SetupFrame>
    );
  }
  if (!isFresh) return <Redirect href={home} />;

  const finish = () => router.replace(home);
  switch (after.name) {
    case "child":
      return <ChildStep onAdded={(child) => setAfter({ name: "money", child })} onLater={finish} />;
    case "money":
      return (
        <PocketMoneyStep
          childId={after.child.id}
          nickname={after.child.nickname}
          onDone={() => setAfter({ name: "freedom", child: after.child })}
        />
      );
    case "freedom":
      return (
        <FreedomStep
          childId={after.child.id}
          nickname={after.child.nickname}
          onDone={() => setAfter({ name: "share", child: after.child })}
        />
      );
    case "share":
      return <ShareStep nickname={after.child.nickname} onDone={finish} />;
  }
}

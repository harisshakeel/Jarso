import { safeNextPath } from "@jarso/core/auth";
import { type Href, Redirect } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { homeFor, UnavailableNotice, useSession } from "@/features/auth";
import { FamilyStep } from "./family-step";
import { ProfileStep } from "./profile-step";
import { isSetUp, useParentSetup } from "./use-setup";

/**
 * The parent's setup on the phone: their details first, then the family, showing only the step
 * still missing. Once both are done it replaces itself with `next` (an invite link opened before
 * setup) or Family.
 */
export function SetupScreen({ next }: { next?: string }) {
  const { signOut } = useSession();
  const { data, isError, refetch } = useParentSetup();

  // The gate already waits for this read; this covers opening /setup directly.
  if (!data) {
    if (isError) return <UnavailableNotice onRetry={() => void refetch()} />;
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  if (isSetUp(data)) {
    return <Redirect href={safeNextPath(next, homeFor("parent") as string) as Href} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1">
        <ScrollView contentContainerClassName="gap-8 px-4 py-8" keyboardShouldPersistTaps="handled">
          {data.profileComplete ? <FamilyStep /> : <ProfileStep />}
          <Button
            variant="link"
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => void signOut()}
          >
            <Text>Sign out</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

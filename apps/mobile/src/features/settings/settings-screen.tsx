import { offlineCopy } from "@jarso/core/offline";
import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { MemoryList } from "@/features/guide";
import { NotificationsRow } from "@/features/push";
import { useOutboxItems } from "@/lib/outbox";
import { ThemeSection } from "./theme-section";
import { useNickname } from "./use-nickname";

/**
 * The child's Me screen: who they are, how it looks, and signing out. With purchases still kept
 * on the phone, the first tap on Sign out says so; they stay and send at the next sign-in.
 */
export function SettingsScreen() {
  const { signOut, userId } = useSession();
  const waiting = useOutboxItems(userId).length > 0;
  const [warned, setWarned] = useState(false);
  const onSignOut = () => {
    if (waiting && !warned) return setWarned(true);
    void signOut();
  };
  const signOutLabel = waiting && warned ? offlineCopy.signOutAnyway : "Sign out";
  const { data: nickname } = useNickname();
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-4 px-4 pt-4 pb-10">
        <ScreenHeader title="Me" />
        <Card className="gap-1">
          <Text accessibilityRole="header" className="font-sans-bold text-h3">
            You
          </Text>
          <Text className="text-muted-foreground">
            {nickname ? `You sign in as ${nickname}.` : "Your nickname is how you sign in."} A
            parent can change your nickname or PIN.
          </Text>
        </Card>
        <NotificationsRow />
        <ThemeSection />
        {/* What Jarso remembers: while the guide is on, or whenever any memory exists. */}
        <MemoryList />
        <Card>
          <Text accessibilityRole="header" className="font-sans-bold text-h3">
            Done for now?
          </Text>
          <Text className="text-muted-foreground">
            You can sign back in with your family code, nickname and PIN.
          </Text>
          {waiting && warned ? (
            <Text accessibilityRole="alert" className="font-sans-bold">
              {offlineCopy.signOutWaiting}
            </Text>
          ) : null}
          <Button size="lg" variant="outline" accessibilityLabel={signOutLabel} onPress={onSignOut}>
            <Text>{signOutLabel}</Text>
          </Button>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

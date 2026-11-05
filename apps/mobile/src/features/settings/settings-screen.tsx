import { guideCopy } from "@jarso/core/guide";
import { noticeGroupCopy } from "@jarso/core/notifications";
import { offlineCopy } from "@jarso/core/offline";
import { useRouter } from "expo-router";
import { BellIcon, BrainIcon, MoonIcon } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  InitialAvatar,
  ListGroup,
  ListRow,
  RowIcon,
  ScreenHeader,
} from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { MemoryList, useOwnMemories } from "@/features/guide";
import { useOutboxItems } from "@/lib/outbox";
import { DarkModeRow } from "./dark-mode-row";
import { useNickname } from "./use-nickname";

/** Row labels on the child's Me stay at the child's card-title size (h3). */
const CHILD_LABEL = "text-h3";

/**
 * The child's Me screen, the same menu style as the parent's Settings (spec 2026-11-05): who
 * they are, one group (Notifications, Dark mode, What Jarso remembers), and Sign out at the
 * bottom. With purchases still kept on the phone, the first tap on Sign out says so; they stay
 * and send at the next sign-in.
 */
export function SettingsScreen() {
  const router = useRouter();
  const { signOut, userId } = useSession();
  const waiting = useOutboxItems(userId).length > 0;
  const [warned, setWarned] = useState(false);
  const onSignOut = () => {
    if (waiting && !warned) return setWarned(true);
    void signOut();
  };
  const signOutLabel = waiting && warned ? offlineCopy.signOutAnyway : "Sign out";
  const { data: nickname } = useNickname();
  const memories = useOwnMemories();
  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="grow gap-4 px-4 pt-4 pb-4">
        <ScreenHeader title="Me" />
        <Card className="flex-row items-center gap-3">
          {nickname ? <InitialAvatar name={nickname} large /> : null}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text accessibilityRole="header" className="font-sans-bold text-h3">
              {nickname ?? "You"}
            </Text>
            <Text className="text-muted-foreground">
              {nickname ? `You sign in as ${nickname}.` : "Your nickname is how you sign in."} A
              parent can change your nickname or PIN.
            </Text>
          </View>
        </Card>

        <ListGroup>
          <ListRow
            label={noticeGroupCopy.title}
            labelClassName={CHILD_LABEL}
            leading={<RowIcon icon={BellIcon} />}
            onPress={() => router.push("/(child)/notifications")}
          />
          <DarkModeRow
            detail={false}
            labelClassName={CHILD_LABEL}
            leading={<RowIcon icon={MoonIcon} />}
          />
          {/* While the guide is on, or whenever any memory exists (as the list itself). */}
          {memories.show ? (
            <ListRow
              label={guideCopy.memories.title}
              detail={guideCopy.memories.count(memories.list.length)}
              labelClassName={CHILD_LABEL}
              leading={<RowIcon icon={BrainIcon} />}
              onPress={() => router.push("/(child)/memories")}
            />
          ) : null}
        </ListGroup>

        <View className="mt-auto gap-3 pt-6">
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** "What Jarso remembers" as its own page from Me: today's list, with Forget on each note. */
export function MemoriesScreen() {
  return (
    <ScrollView className="bg-background" contentContainerClassName="gap-4 px-4 pt-4 pb-10">
      <MemoryList />
    </ScrollView>
  );
}

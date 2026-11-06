import { guideCopy } from "@jarso/core/guide";
import { noticeGroupCopy } from "@jarso/core/notifications";
import { offlineCopy } from "@jarso/core/offline";
import { onboardingCopy } from "@jarso/core/onboarding";
import { meCopy } from "@jarso/core/progress";
import { useRouter } from "expo-router";
import {
  BellIcon,
  BrainIcon,
  ClockIcon,
  MoonIcon,
  SparklesIcon,
  Volume2Icon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ListGroup, ListRow, RowIcon } from "@/components/screen";
import { Button, Switch, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { MemoryList, useOwnMemories } from "@/features/guide";
import { DarkModeRow } from "@/features/settings";
import { useOutboxItems } from "@/lib/outbox";
import { useSoundOn } from "@/lib/sound";

/** Row labels on the child's Me stay at the child's card-title size (h3). */
const CHILD_LABEL = "text-h3";

/** "Sound effects": the whole 48 dp row is the switch, as Dark mode. */
function SoundRow() {
  const [on, setOn] = useSoundOn();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={meCopy.sound}
      accessibilityState={{ checked: on }}
      onPress={() => setOn(!on)}
      className="min-h-12 flex-row items-center gap-3 py-1 active:opacity-70"
    >
      <RowIcon icon={Volume2Icon} />
      <Text className={`min-w-0 flex-1 font-sans-semibold ${CHILD_LABEL}`}>{meCopy.sound}</Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={on} onValueChange={setOn} />
      </View>
    </Pressable>
  );
}

/**
 * Me's settings: one group (Sound effects, Notifications, Dark mode, What Jarso remembers, My
 * asks, Replay the intro), then Sign out. With purchases still kept on the phone, the first tap on Sign out says
 * so; they stay and send at the next sign-in.
 */
export function MeSettings() {
  const router = useRouter();
  const { signOut, userId } = useSession();
  const waiting = useOutboxItems(userId).length > 0;
  const [warned, setWarned] = useState(false);
  const onSignOut = () => {
    if (waiting && !warned) return setWarned(true);
    void signOut();
  };
  const signOutLabel = waiting && warned ? offlineCopy.signOutAnyway : "Sign out";
  const memories = useOwnMemories();
  return (
    <View className="gap-4">
      <ListGroup label={meCopy.settings}>
        <SoundRow />
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
        <ListRow
          label={meCopy.myAsks}
          labelClassName={CHILD_LABEL}
          leading={<RowIcon icon={ClockIcon} />}
          onPress={() => router.push("/(child)/requests")}
        />
        <ListRow
          label={onboardingCopy.replay}
          labelClassName={CHILD_LABEL}
          leading={<RowIcon icon={SparklesIcon} />}
          onPress={() => router.push("/(child)/onboarding")}
        />
      </ListGroup>

      <View className="gap-3 pt-2">
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
    </View>
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

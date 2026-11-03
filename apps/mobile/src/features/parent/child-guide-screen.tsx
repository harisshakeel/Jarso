import { parentPageCopy } from "@jarso/core/dashboard";
import { parentGuideCopy } from "@jarso/core/guide";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Card } from "@/components/screen";
import { Text } from "@/components/ui";
import { useFamily } from "@/features/family";
import {
  ChildChatList,
  ChildTranscript,
  GuideSwitch,
  MemoryList,
  useChildChats,
  useChildTranscript,
  useParentGuideState,
} from "@/features/guide";
import { ScreenState } from "./screen-state";
import { useChild } from "./use-child";

/**
 * One child's Jarso chats for their parent (the web's child guide page): the switch, what Jarso
 * remembers about them, then every chat, flagged first. With Jarso not set up and no chats kept,
 * just the not-set-up line.
 */
export function ChildGuideScreen({ childId }: { childId: string }) {
  const router = useRouter();
  const family = useFamily();
  const child = useChild(childId);
  const state = useParentGuideState();
  const chats = useChildChats(childId);

  if (!family.data || !state.data || !chats.data || !child) {
    const error = family.error ?? state.error ?? chats.error;
    return (
      <ScreenState
        error={error}
        onRetry={() => {
          void family.refetch();
          void state.refetch();
          void chats.refetch();
        }}
      />
    );
  }
  const { configured } = state.data;
  if (!configured && chats.data.length === 0) {
    return (
      <View className="flex-1 bg-background p-4">
        <Text className="text-muted-foreground">{parentGuideCopy.notConfigured}</Text>
      </View>
    );
  }
  const enabled = state.data.enabledChildIds.includes(childId);
  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-4 pb-10"
      refreshControl={
        <RefreshControl
          refreshing={chats.isRefetching}
          onRefresh={() => {
            void chats.refetch();
            void state.refetch();
          }}
        />
      }
    >
      <Text className="text-muted-foreground">{parentPageCopy.chatsIntro}</Text>
      {configured ? (
        <Card>
          {/* Keyed on the server's answer, so a refetch puts the switch where the server says. */}
          <GuideSwitch
            key={String(enabled)}
            childId={childId}
            nickname={child.nickname}
            enabled={enabled}
          />
        </Card>
      ) : null}
      <MemoryList child={child} />
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {parentGuideCopy.chatsLabel}
      </Text>
      <ChildChatList
        chats={chats.data}
        timezone={family.data.family.timezone}
        onOpen={(id) => router.push(`/(parent)/children/${childId}/guide/${id}`)}
      />
    </ScrollView>
  );
}

/** One of the child's chats as their parent reads it. Not this child's, or gone: back. */
export function ChildGuideChatScreen({
  childId,
  conversationId,
}: {
  childId: string;
  conversationId: string;
}) {
  const router = useRouter();
  const family = useFamily();
  const child = useChild(childId);
  const transcript = useChildTranscript(childId, conversationId);
  const gone = transcript.data === null;
  useEffect(() => {
    if (gone) router.back();
  }, [gone, router]);

  if (gone) return null;
  if (!transcript.data || !family.data) {
    return (
      <ScreenState
        error={transcript.error ?? family.error}
        onRetry={() => {
          void transcript.refetch();
          void family.refetch();
        }}
      />
    );
  }
  const { summary, messages } = transcript.data;
  return (
    <ScrollView className="bg-background" contentContainerClassName="gap-4 px-4 pt-4 pb-10">
      <Stack.Screen options={{ title: summary.label }} />
      {summary.flagged ? (
        <Text className="text-muted-foreground">{parentPageCopy.chatFlaggedIntro}</Text>
      ) : null}
      <ChildTranscript
        messages={messages}
        timezone={family.data.family.timezone}
        nickname={child?.nickname}
      />
    </ScrollView>
  );
}

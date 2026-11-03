import type { ChildSummary } from "@jarso/core/family";
import {
  type ConversationSummary,
  chatDay,
  chatTitle,
  guideCopy,
  guideUi,
  MAX_TURNS,
  parentGuideCopy,
  threadMessagesFrom,
} from "@jarso/core/guide";
import { useRouter } from "expo-router";
import { HistoryIcon, MessageSquarePlusIcon, XIcon } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Card, CardSeparator, ListRow, ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useFamily, useParentProfile } from "@/features/family";
import {
  ParentThread,
  useParentChats,
  useParentGuideState,
  useParentTranscript,
} from "@/features/guide";
import { toUserMessage, useTokens } from "@/lib";
import { ScreenState } from "./screen-state";

/**
 * The parent's Jarso tab (the web's parent Jarso page): a chat about one of their children, with
 * their past chats behind "History". Jarso not set up on the server: the switched-off line; off
 * for every child: the web's line with the way Home.
 */
export function ParentJarsoScreen() {
  const state = useParentGuideState();
  const family = useFamily();
  const [chatId, setChatId] = useState<string | null>(null);
  // Bumped by "New chat", so a new chat starts over even from an unsaved new chat.
  const [fresh, setFresh] = useState(0);
  const [history, setHistory] = useState(false);

  if (!state.data) {
    return <ScreenState error={state.error} onRetry={() => void state.refetch()} />;
  }
  if (!state.data.configured) {
    return (
      <Frame>
        <Text className="rounded-xl bg-muted p-4 text-muted-foreground">
          {guideCopy.switchedOff}
        </Text>
      </Frame>
    );
  }
  if (!family.data) {
    return <ScreenState error={family.error} onRetry={() => void family.refetch()} />;
  }
  const { family: settings, children } = family.data;
  const enabled = new Set(state.data.enabledChildIds);
  const kids = children.filter((child) => enabled.has(child.id));

  const newChat = () => {
    setChatId(null);
    setFresh((n) => n + 1);
    setHistory(false);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-2">
        <ScreenHeader
          title={guideCopy.name}
          trailing={
            <Button
              variant="ghost"
              accessibilityLabel={guideCopy.history.button}
              accessibilityState={{ expanded: history }}
              onPress={() => setHistory((open) => !open)}
            >
              <HistoryToggleIcon open={history} />
              <Text>{guideCopy.history.button}</Text>
            </Button>
          }
        />
      </View>
      {history ? (
        <HistoryList
          members={children}
          timezone={settings.timezone}
          onNew={newChat}
          onOpen={(id) => {
            setChatId(id);
            setHistory(false);
          }}
        />
      ) : chatId ? (
        <ReopenedThread
          key={`${chatId}-${fresh}`}
          chatId={chatId}
          kids={kids}
          members={children}
          currency={settings.currency}
        />
      ) : kids.length > 0 ? (
        <NewThread key={`new-${fresh}`} kids={kids} />
      ) : (
        <AllOff />
      )}
    </View>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <ScrollView className="bg-background" contentContainerClassName="gap-4 px-4 pt-2 pb-10">
      <ScreenHeader title={guideCopy.name} />
      {children}
    </ScrollView>
  );
}

function HistoryToggleIcon({ open }: { open: boolean }) {
  const tokens = useTokens();
  return open ? (
    <XIcon size={20} color={tokens.foreground} />
  ) : (
    <HistoryIcon size={20} color={tokens.foreground} />
  );
}

/** The parent's first name, for the greeting. */
function usePerson(): string {
  const fullName = useParentProfile().data?.fullName;
  return fullName?.trim().split(/\s+/)[0] ?? "";
}

function NewThread({ kids }: { kids: ChildSummary[] }) {
  return <ParentThread kids={kids} person={usePerson()} />;
}

/** A past chat picked from History; one about a child no longer in the family is a new chat. */
function ReopenedThread({
  chatId,
  kids,
  members,
  currency,
}: {
  chatId: string;
  kids: ChildSummary[];
  members: ChildSummary[];
  currency: string;
}) {
  const person = usePerson();
  const transcript = useParentTranscript(chatId);
  if (transcript.data === undefined) {
    return transcript.error ? (
      <View className="flex-1 items-center justify-center p-6">
        <Text accessibilityRole="alert">{toUserMessage(transcript.error)}</Text>
      </View>
    ) : (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  const found = transcript.data;
  const about = found ? members.find((child) => child.id === found.summary.childId) : undefined;
  if (!found || !about)
    return kids.length > 0 ? <ParentThread kids={kids} person={person} /> : <AllOff />;
  return (
    <ParentThread
      kids={kids}
      person={person}
      reopened={{
        conversationId: found.summary.id,
        turnsLeft: Math.max(0, MAX_TURNS - found.summary.turns),
        messages: threadMessagesFrom(found.messages, currency, about.nickname),
        kid: about,
      }}
    />
  );
}

/** Jarso is off for every child: say so, with the way Home. */
function AllOff() {
  const router = useRouter();
  return (
    <View className="gap-3 px-4 pt-4">
      <Text className="rounded-xl bg-muted p-4 text-muted-foreground">
        {parentGuideCopy.offForEveryChild}
      </Text>
      <Button
        variant="outline"
        accessibilityLabel={parentGuideCopy.backHome}
        className="self-start"
        onPress={() => router.navigate("/(parent)/(tabs)")}
      >
        <Text>{parentGuideCopy.backHome}</Text>
      </Button>
    </View>
  );
}

/** The parent's past chats, newest first, each naming the child it was about. */
function HistoryList({
  members,
  timezone,
  onNew,
  onOpen,
}: {
  members: ChildSummary[];
  timezone: string;
  onNew: () => void;
  onOpen: (conversationId: string) => void;
}) {
  const tokens = useTokens();
  const chats = useParentChats();
  const names = new Map(members.map((child) => [child.id, child.nickname]));
  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pt-4 pb-10">
      <Button size="lg" accessibilityLabel={guideUi.newChat} onPress={onNew}>
        <MessageSquarePlusIcon size={20} color={tokens["primary-foreground"]} />
        <Text>{guideUi.newChat}</Text>
      </Button>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {guideCopy.history.title}
      </Text>
      {!chats.data ? (
        chats.error ? (
          <Text accessibilityRole="alert">{toUserMessage(chats.error)}</Text>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading" />
        )
      ) : chats.data.length === 0 ? (
        <Text className="text-muted-foreground">{guideCopy.history.empty}</Text>
      ) : (
        <Card accessibilityLabel={guideUi.pastChats} className="gap-0 py-1">
          {chats.data.map((chat: ConversationSummary, i) => {
            const title = chatTitle(chat);
            const name = names.get(chat.childId);
            const detail = `${chatDay(chat.lastMessageAt, timezone)}${name ? ` · ${name}` : ""}`;
            return (
              <View key={chat.id}>
                {i > 0 ? <CardSeparator /> : null}
                <ListRow
                  label={title}
                  detail={detail}
                  accessibilityLabel={`${title}, ${detail}`}
                  onPress={() => onOpen(chat.id)}
                />
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

import {
  chatDay,
  chatTitle,
  type GuideContextRef,
  guideContextSchema,
  guideCopy,
  guideUi,
  jarsoTabCopy,
  MAX_TURNS,
  threadMessagesFrom,
} from "@jarso/core/guide";
import { useRouter } from "expo-router";
import {
  BotIcon,
  GraduationCapIcon,
  type LucideIcon,
  MessageSquarePlusIcon,
  PiggyBankIcon,
  ShoppingBagIcon,
  SparklesIcon,
} from "lucide-react-native";
import { type ReactNode, useEffect } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Jarso } from "@/components/brand";
import { Card, CardSeparator, ListGroup, ListRow } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { useParentLabel, useProgress } from "@/features/progress";
import { toUserMessage, useTokens } from "@/lib";
import { GuideThread } from "./thread";
import { useMyChats, useTranscript } from "./use-guide";
import { useGuideState } from "./use-guide-state";

const HOME = "/(child)/(tabs)" as const;
const { suggestions } = guideCopy;
const SUGGESTIONS = [suggestions.jars, suggestions.spent, suggestions.saving, suggestions.learning];

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator accessibilityLabel="Loading" />
    </View>
  );
}

/**
 * Renders the guide only once the server says it is on for this child. Off, unknown or a deep
 * link while it is off: back to Home, and nothing of the chat is shown.
 */
function GuideGate({ children }: { children: (introNeeded: boolean) => ReactNode }) {
  const router = useRouter();
  const guide = useGuideState();
  const on = guide.data?.available === true;
  // Decide on the data first: a failed refetch (a network blip after a turn) keeps what the
  // server last said, so an open chat stays open. Only no data and an error means off.
  const off = guide.data ? !on : guide.isError;
  useEffect(() => {
    if (off) router.replace(HOME);
  }, [off, router]);
  if (!on) return off ? null : <Loading />;
  return <>{children(guide.data?.introNeeded ?? false)}</>;
}

/** The Jarso tab: a new chat, then the child's own past chats (FR07). */
export function JarsoScreen() {
  return <GuideGate>{() => <ChatList />}</GuideGate>;
}

const STARTER_ICONS: Record<
  (typeof jarsoTabCopy.starters)[number]["key"],
  { icon: LucideIcon; tint: string; colour: "gold-text" | "primary" | "ai" }
> = {
  saving: { icon: PiggyBankIcon, tint: "bg-tint-gold", colour: "gold-text" },
  spent: { icon: ShoppingBagIcon, tint: "bg-tint-teal", colour: "primary" },
  learning: { icon: GraduationCapIcon, tint: "bg-tint-grape", colour: "ai" },
};

function ChatList() {
  const router = useRouter();
  const tokens = useTokens();
  const home = useHome();
  const chats = useMyChats();
  const { data: progress } = useProgress();
  const parent = useParentLabel();
  const timezone = home.data?.context.timezone ?? "UTC";
  const open = (params: { conversationId: string; draft?: string }) =>
    router.push({ pathname: "/(child)/jarso/[conversationId]", params });
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-4 pb-10"
        refreshControl={
          <RefreshControl refreshing={chats.isRefetching} onRefresh={() => void chats.refetch()} />
        }
      >
        <View className="items-center gap-2">
          <Jarso mood="wave" size={120} fill={0.6} look={progress?.look} />
          <Text accessibilityRole="header" className="text-center font-sans-extrabold text-h1">
            {jarsoTabCopy.heading}
          </Text>
          {/* The AI notice (FR09): who Jarso is and who can read the chats. */}
          <View className="flex-row items-center gap-1.5 rounded-full bg-tint-grape px-3 py-1.5">
            <SparklesIcon size={16} color={tokens.ai} />
            <Text className="font-sans-bold text-small">{jarsoTabCopy.notice(parent)}</Text>
          </View>
        </View>
        <Button
          size="lg"
          variant="keycap"
          accessibilityLabel={guideUi.newChat}
          onPress={() => open({ conversationId: "new" })}
        >
          <MessageSquarePlusIcon size={20} color={tokens["primary-foreground"]} />
          <Text>{guideUi.newChat}</Text>
        </Button>
        <ListGroup label={jarsoTabCopy.startersLabel}>
          {jarsoTabCopy.starters.map((starter) => {
            const { icon: Icon, tint, colour } = STARTER_ICONS[starter.key];
            return (
              <ListRow
                key={starter.key}
                label={starter.question}
                labelClassName="text-h3"
                leading={
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    className={`size-10 items-center justify-center rounded-xl ${tint}`}
                  >
                    <Icon size={20} color={tokens[colour]} />
                  </View>
                }
                onPress={() => open({ conversationId: "new", draft: starter.question })}
              />
            );
          })}
        </ListGroup>
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {jarsoTabCopy.pastChats}
        </Text>
        {!chats.data ? (
          chats.error ? (
            <Text accessibilityRole="alert">{toUserMessage(chats.error)}</Text>
          ) : (
            <ActivityIndicator accessibilityLabel="Loading" />
          )
        ) : chats.data.length === 0 ? (
          <Text className="text-muted-foreground">{guideUi.noChats}</Text>
        ) : (
          <Card accessibilityLabel={guideUi.pastChats} className="gap-0 py-1">
            {chats.data.map((chat, i) => {
              const title = chatTitle(chat);
              const day = chatDay(chat.lastMessageAt, timezone);
              return (
                <View key={chat.id}>
                  {i > 0 ? <CardSeparator /> : null}
                  <ListRow
                    label={title}
                    detail={day}
                    accessibilityLabel={`${title}, ${day}`}
                    onPress={() => open({ conversationId: chat.id })}
                  />
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One chat: a new one ("new"), or one of the child's own picked up again with its turns. */
export function JarsoChatScreen({
  conversationId,
  draft,
}: {
  conversationId: string;
  /** A starter question typed into a new chat's box (the Jarso tab). */
  draft?: string;
}) {
  return (
    <GuideGate>
      {(introNeeded) => (
        <ChatThread conversationId={conversationId} introNeeded={introNeeded} draft={draft} />
      )}
    </GuideGate>
  );
}

function ChatThread({
  conversationId,
  introNeeded,
  draft,
}: {
  conversationId: string;
  introNeeded: boolean;
  draft?: string;
}) {
  const fresh = conversationId === "new";
  const home = useHome();
  const transcript = useTranscript(fresh ? null : conversationId);
  const currency = home.data?.context.currency;
  // The thread copies a reopened chat into its state once: wait for the family's currency first.
  if ((!fresh && transcript.data === undefined) || !currency) {
    const error = transcript.error ?? home.error;
    return error ? (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text accessibilityRole="alert">{toUserMessage(error)}</Text>
      </View>
    ) : (
      <Loading />
    );
  }
  const found = transcript.data;
  // Not theirs or gone: a new chat, as on the web.
  const reopened = found
    ? {
        conversationId: found.summary.id,
        turnsLeft: Math.max(0, MAX_TURNS - found.summary.turns),
        messages: threadMessagesFrom(found.messages, currency),
      }
    : undefined;
  return (
    <View className="flex-1 bg-background">
      <GuideThread
        context={{ entry: "home" }}
        introNeeded={introNeeded}
        suggestions={SUGGESTIONS}
        reopened={reopened}
        draft={fresh ? draft : undefined}
      />
    </View>
  );
}

function SheetTitle() {
  const tokens = useTokens();
  return (
    <View className="flex-row items-center gap-2 px-4 pt-6">
      <BotIcon size={20} color={tokens.foreground} />
      <Text accessibilityRole="header" className="font-sans-extrabold text-h3">
        {guideCopy.name}
      </Text>
    </View>
  );
}

/** The `context` route param, as the guide's schema allows it; anything else is null. */
export function parseGuideContext(raw: string | undefined): GuideContextRef | null {
  if (!raw) return null;
  try {
    const parsed = guideContextSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.entry !== "parent" ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Jarso in a sheet, for "Help me" or "Why?" beside a step, or "Ask about this" on a topic. Each
 * opening is a fresh chat about where it was opened from.
 */
export function GuideSheetScreen({ context: raw }: { context?: string }) {
  const router = useRouter();
  const context = parseGuideContext(raw);
  useEffect(() => {
    if (!context) router.back();
  }, [context, router]);
  if (!context) return null;
  return (
    <GuideGate>
      {(introNeeded) => (
        <View className="flex-1 bg-background">
          <SheetTitle />
          <GuideThread context={context} introNeeded={introNeeded} variant="sheet" />
        </View>
      )}
    </GuideGate>
  );
}

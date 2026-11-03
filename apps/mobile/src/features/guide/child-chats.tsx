import {
  type ConversationSummary,
  chatWhen,
  parentGuideCopy,
  type TranscriptMessage,
} from "@jarso/core/guide";
import { FlagIcon, ScanSearchIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

/** A child's chats as their parent reads them (the web's ChatList), flagged first as given. */
export function ChildChatList({
  chats,
  timezone,
  onOpen,
}: {
  chats: ConversationSummary[];
  timezone: string;
  onOpen: (conversationId: string) => void;
}) {
  const tokens = useTokens();
  if (chats.length === 0) {
    return <Text className="text-muted-foreground">{parentGuideCopy.noChats}</Text>;
  }
  return (
    <View accessibilityLabel={parentGuideCopy.chatsLabel} className="gap-2">
      {chats.map((chat) => {
        const when = chatWhen(chat.lastMessageAt, timezone);
        const questions = parentGuideCopy.questions(chat.turns);
        const label = [
          chat.label,
          when,
          chat.flagged ? parentGuideCopy.worthALook : null,
          chat.preview,
          questions,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <Pressable
            key={chat.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onOpen(chat.id)}
            className={cn(
              "min-h-12 gap-1 rounded-xl border bg-card px-4 py-3",
              chat.flagged ? "border-gold bg-gold-100" : "border-border",
            )}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 font-sans-semibold">{chat.label}</Text>
              <Text className="text-muted-foreground">{when}</Text>
            </View>
            {chat.flagged ? (
              <View className="flex-row items-center gap-1">
                <FlagIcon size={16} color={tokens["gold-text"]} />
                <Text className="font-sans-semibold text-gold-text">
                  {parentGuideCopy.worthALook}
                </Text>
              </View>
            ) : null}
            <Text numberOfLines={2} className="text-muted-foreground">
              {chat.preview}
            </Text>
            <Text className="text-muted-foreground">{questions}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const ROUTE_NOTES = parentGuideCopy.routeNotes;

/** One chat as the parent reads it (the web's Transcript). A message that got a safety response stays private. */
export function ChildTranscript({
  messages,
  timezone,
  nickname = parentGuideCopy.yourChild,
}: {
  messages: TranscriptMessage[];
  timezone: string;
  nickname?: string;
}) {
  const tokens = useTokens();
  return (
    <View accessibilityLabel={parentGuideCopy.chatLabel} className="gap-3">
      {messages.map((message) => {
        const note = message.route ? ROUTE_NOTES[message.route] : undefined;
        const who =
          message.role === "child"
            ? nickname
            : message.role === "guide"
              ? parentGuideCopy.guide
              : parentGuideCopy.fixedCopy;
        return (
          <View
            key={message.id}
            className={cn(
              "gap-1 rounded-2xl px-4 py-3",
              message.role === "child" ? "ml-8 self-end bg-secondary" : "mr-8 self-start bg-card",
            )}
          >
            <Text className="font-sans-semibold text-muted-foreground">
              {`${who} · ${chatWhen(message.createdAt, timezone)}`}
            </Text>
            <Text className={cn(message.hidden && "text-muted-foreground italic")}>
              {message.text}
            </Text>
            {message.lookedAt.length > 0 ? (
              <View className="flex-row items-center gap-1">
                <ScanSearchIcon size={16} color={tokens["muted-foreground"]} />
                <Text className="flex-1 text-muted-foreground">
                  {parentGuideCopy.lookedAt(message.lookedAt)}
                </Text>
              </View>
            ) : null}
            {note ? (
              <View className="flex-row items-center gap-1">
                {message.flagged ? <FlagIcon size={16} color={tokens["gold-text"]} /> : null}
                <Text
                  className={cn(
                    "flex-1",
                    message.flagged ? "font-sans-semibold text-gold-text" : "text-muted-foreground",
                  )}
                >
                  {note}
                </Text>
              </View>
            ) : null}
            {message.rating ? (
              <View className="flex-row items-center gap-1">
                {message.rating === 1 ? (
                  <ThumbsUpIcon size={16} color={tokens["muted-foreground"]} />
                ) : (
                  <ThumbsDownIcon size={16} color={tokens["muted-foreground"]} />
                )}
                <Text className="flex-1 text-muted-foreground">
                  {message.rating === 1 ? parentGuideCopy.helpful : parentGuideCopy.notHelpful}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

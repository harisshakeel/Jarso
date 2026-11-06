import type { GuideContextRef, ThreadMessage } from "@jarso/core/guide";
import { guideCopy, guideUi, MAX_MESSAGE_LENGTH } from "@jarso/core/guide";
import { useQueryClient } from "@tanstack/react-query";
import { SendHorizontalIcon } from "lucide-react-native";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  type ScrollViewInstance,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "@/components/screen";
import { Button, Text, useBodySizeClass } from "@/components/ui";
import { useSession } from "@/features/auth";
import { cn, useTokens } from "@/lib";
import { keys } from "@/lib/query";
import { GuideIntro } from "./intro";
import { GuideBubble } from "./reply";
import { ThinkingBubble } from "./thinking";
import { useSendTurn } from "./use-send-turn";

/** A stored chat to pick up again: its id, how many turns are left, and its messages so far. */
export type ReopenedChat = { conversationId: string; turnsLeft: number; messages: ThreadMessage[] };

/** A child a parent asks Jarso about. */
export type Kid = { id: string; nickname: string };

/**
 * The children who have read the intro in this run of the app, by user id: other guide screens
 * (a new step's "Help me") don't show it again to them, while a second child signing in on the
 * same phone still sees it. The server stops asking once a child has chatted.
 */
const introAcknowledged = new Set<string>();

type GuideThreadProps = {
  /** What the chat was opened about (keys only; the server looks the text up). */
  context: GuideContextRef;
  introNeeded: boolean;
  /** Questions to start with (the Jarso tab). */
  suggestions?: string[];
  reopened?: ReopenedChat;
  /** The step sheet's wording ("Your question", "Send") or the chat page's ("Ask"). */
  variant?: "page" | "sheet";
  /**
   * A parent asks about one of their children (`kid`, with `context` `{ entry: "parent" }`); the
   * child asks about themselves.
   */
  audience?: "child" | "parent";
  kid?: Kid;
  /** A question already typed in the box (a starter from the Jarso tab); never sent by itself. */
  draft?: string;
};

/**
 * One chat with Jarso (FR07), the phone's twin of the web's GuideThread: the AI disclosure,
 * the intro for a first chat, the messages, the status bubble while Jarso works and the
 * composer. The question shows as sent the moment it goes, with Jarso thinking under it; a
 * failure puts it back in the box. 12 turns a chat, then "Start a new chat".
 */
export function GuideThread({
  context,
  introNeeded,
  suggestions = [],
  reopened,
  variant = "page",
  audience = "child",
  kid,
  draft,
}: GuideThreadProps) {
  const tokens = useTokens();
  const bodyClass = useBodySizeClass();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const turn = useSendTurn();
  const sheet = variant === "sheet";
  const forParent = audience === "parent" && kid !== undefined;
  const [introSeen, setIntroSeen] = useState(
    () => !introNeeded || introAcknowledged.has(userId ?? ""),
  );
  const [conversationId, setConversationId] = useState(reopened?.conversationId ?? null);
  const [messages, setMessages] = useState<ThreadMessage[]>(reopened?.messages ?? []);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(reopened?.turnsLeft ?? null);
  const [text, setText] = useState(draft ?? "");
  // The question on its way: shown as sent while Jarso works, put back in the box if it fails.
  const [sending, setSending] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(reopened ? reopened.turnsLeft === 0 : false);
  const scroll = useRef<ScrollViewInstance>(null);
  // Bumped on every new chat, so a reply that lands after it is dropped.
  const generation = useRef(0);
  const pending = sending !== null;

  function newChat() {
    generation.current += 1;
    turn.reset();
    setConversationId(null);
    setMessages([]);
    setTurnsLeft(null);
    setText("");
    setSending(null);
    setStatus(null);
    setError(null);
    setFull(false);
  }

  async function ask(question: string) {
    if (!question || pending) return;
    setError(null);
    setStatus(null);
    setSending(question);
    setText("");
    const started = generation.current;
    const result = await turn.send({ text: question, conversationId, context }, (line) => {
      if (started === generation.current) setStatus(line);
    });
    if (started !== generation.current) return;
    setStatus(null);
    setSending(null);
    if (!result.ok) {
      setText(question);
      if (result.error.code === "CONFLICT") setFull(true);
      setError(
        result.error.code === "VALIDATION"
          ? (result.error.fieldErrors?.text?.[0] ?? result.error.message)
          : result.error.code === "INTERNAL"
            ? guideCopy.routes.unavailable
            : result.error.message,
      );
      return;
    }
    const { reply } = result.data;
    setConversationId(result.data.conversationId);
    setTurnsLeft(result.data.turnsLeft);
    if (result.data.turnsLeft === 0) setFull(true);
    setMessages((current) => [
      ...current,
      { id: `child-${current.length}`, from: "child", text: question },
      { id: reply.messageId ?? `guide-${current.length}`, from: "guide", reply },
    ]);
    const id = userId ?? "";
    if (forParent) {
      // The parent's History shows the chat once it has a turn.
      void queryClient.invalidateQueries({ queryKey: keys.parentChats(id) });
      return;
    }
    // The chat list and "intro needed" change once the child has chatted.
    void queryClient.invalidateQueries({ queryKey: keys.chats(id) });
    void queryClient.invalidateQueries({ queryKey: keys.guideState(id) });
  }

  const disclosure = forParent ? guideCopy.parent.disclosure(kid.nickname) : guideCopy.disclosure;
  const placeholder = forParent
    ? guideCopy.parent.placeholder(kid.nickname)
    : sheet
      ? guideCopy.placeholder
      : guideCopy.homePlaceholder;
  const parent = forParent ? { childId: kid.id, onChangeDraft: setText } : undefined;

  if (!introSeen) {
    return (
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Text className="text-muted-foreground">{guideCopy.disclosure}</Text>
        <GuideIntro
          onDone={() => {
            if (userId) introAcknowledged.add(userId);
            setIntroSeen(true);
          }}
        />
      </ScrollView>
    );
  }

  const label = sheet ? guideUi.sheetQuestionLabel : guideUi.questionLabel;
  const action = sheet ? guideUi.send : guideUi.ask;
  return (
    <KeyboardAvoidingView className="flex-1">
      <ScrollView
        ref={scroll}
        className="flex-1"
        contentContainerClassName="gap-3 p-4"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        <Text className="text-muted-foreground">{disclosure}</Text>
        {messages.length > 0 || sending ? (
          <View
            accessibilityLabel={sheet ? guideUi.sheetChatLabel : guideUi.chatLabel}
            className="gap-3"
          >
            {messages.map((message) =>
              message.from === "child" ? (
                <SentBubble key={message.id} text={message.text} />
              ) : (
                <GuideBubble key={message.id} reply={message.reply} parent={parent} />
              ),
            )}
            {sending ? <SentBubble text={sending} /> : null}
          </View>
        ) : null}
        {pending ? <ThinkingBubble status={status} /> : null}
        {messages.length === 0 && !pending && suggestions.length > 0 ? (
          <View accessibilityLabel={guideUi.tryThese} className="flex-row flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                accessibilityLabel={suggestion}
                className="h-auto min-h-11 py-2"
                onPress={() => void ask(suggestion)}
              >
                <Text>{suggestion}</Text>
              </Button>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View className="gap-2 border-border border-t bg-background p-4">
        {/* A full chat says so once, in the panel below (the server's message is the same). */}
        {error && !(full && error === guideCopy.chatFull) ? (
          <Text accessibilityRole="alert" className="text-destructive">
            {error}
          </Text>
        ) : null}
        {full ? (
          <View className="gap-2">
            <Text className="text-muted-foreground">{guideCopy.chatFull}</Text>
            <Button
              variant="outline"
              accessibilityLabel={guideCopy.newChat}
              className="self-start"
              onPress={newChat}
            >
              <Text>{guideCopy.newChat}</Text>
            </Button>
          </View>
        ) : (
          <>
            <TextInput
              accessibilityLabel={label}
              value={text}
              onChangeText={(value) => setText(value.slice(0, MAX_MESSAGE_LENGTH))}
              maxLength={MAX_MESSAGE_LENGTH}
              multiline
              placeholder={placeholder}
              placeholderTextColor={tokens["muted-foreground"]}
              className={cn(
                "min-h-14 rounded-xl border border-input bg-card px-3 py-2 font-sans text-foreground",
                bodyClass,
              )}
            />
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-muted-foreground">
                {`${guideUi.count(text.length, MAX_MESSAGE_LENGTH)}${
                  turnsLeft !== null && turnsLeft <= 3 ? guideUi.turnsLeft(turnsLeft) : ""
                }`}
              </Text>
              <Button
                size="lg"
                accessibilityLabel={action}
                accessibilityState={{ disabled: pending || !text.trim(), busy: pending }}
                disabled={pending || !text.trim()}
                onPress={() => void ask(text.trim())}
              >
                {pending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <SendHorizontalIcon size={18} color={tokens["primary-foreground"]} />
                    <Text>{action}</Text>
                  </>
                )}
              </Button>
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** A question the child asked, on the right in their colour. */
function SentBubble({ text }: { text: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${guideUi.you}${text}`}
      className="ml-8 self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3"
    >
      <Text className="text-primary-foreground">{text}</Text>
    </View>
  );
}

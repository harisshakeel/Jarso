import type { GuideCheck, GuideReply } from "@jarso/core/guide";
import { guideCopy, guideUi } from "@jarso/core/guide";
import { useRouter } from "expo-router";
import {
  BrainIcon,
  CircleCheckIcon,
  PhoneIcon,
  ScanSearchIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { cn, logger, useTokens } from "@/lib";
import { AiChip } from "./intro";
import { useRateMessage } from "./use-guide";

/** One reply from Jarso: the answer, what it looked at, helplines, topics, a check, thumbs. */
export function GuideBubble({ reply }: { reply: GuideReply }) {
  const router = useRouter();
  const tokens = useTokens();
  const rate = useRateMessage();
  const [rating, setRating] = useState<1 | -1 | null>(reply.rating ?? null);

  function give(value: 1 | -1) {
    if (!reply.messageId) return;
    setRating(value);
    rate.mutate(
      { messageId: reply.messageId, rating: value },
      {
        onError: (error) =>
          logger.warn("Could not save a guide rating", {
            error: error instanceof Error ? error.name : "unknown",
          }),
      },
    );
  }

  return (
    <View className="mr-8 gap-3 self-start rounded-2xl rounded-bl-sm bg-card p-4">
      <AiChip />
      <Text>{reply.text}</Text>
      {reply.lookedAt.length > 0 ? (
        <View className="flex-row items-center gap-1.5">
          <ScanSearchIcon size={16} color={tokens["muted-foreground"]} />
          <Text className="flex-1 text-muted-foreground text-sm">
            {guideUi.lookedAt(reply.lookedAt.join(", "))}
          </Text>
        </View>
      ) : null}
      {reply.remembered.length > 0 ? (
        <View className="flex-row items-center gap-1.5">
          <BrainIcon size={16} color={tokens["muted-foreground"]} />
          <Text className="flex-1 text-muted-foreground text-sm">
            {`${guideCopy.remembered} ${reply.remembered.join("; ")}`}
          </Text>
        </View>
      ) : null}
      {reply.helplines.length > 0 ? (
        <View accessibilityLabel={guideUi.helplines} className="gap-2">
          {reply.helplines.map((line) => (
            <View key={line.name} className="gap-0.5 rounded-xl bg-secondary p-3">
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={line.name}
                onPress={() => void Linking.openURL(line.url)}
                className="min-h-11 flex-row items-center gap-2"
              >
                <PhoneIcon size={16} color={tokens["secondary-foreground"]} />
                <Text className="font-sans-bold text-secondary-foreground underline">
                  {line.name}
                </Text>
              </Pressable>
              <Text className="text-secondary-foreground text-sm">{line.contact}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {reply.route === "safety" ? (
        <Text className="font-sans-semibold">{guideCopy.routes.safetyEmergency}</Text>
      ) : null}
      {reply.topics.length > 0 ? (
        <View accessibilityLabel={guideUi.topics} className="flex-row flex-wrap gap-2">
          {reply.topics.map((topic) => (
            <Button
              key={topic.key}
              variant="outline"
              size="sm"
              accessibilityRole="link"
              accessibilityLabel={topic.title}
              className="rounded-full"
              onPress={() =>
                router.push({
                  pathname: "/(child)/learn/topics/[topicKey]",
                  params: { topicKey: topic.key },
                })
              }
            >
              <Text>{topic.title}</Text>
            </Button>
          ))}
        </View>
      ) : null}
      {reply.check ? <CheckQuestion check={reply.check} /> : null}
      {reply.role === "guide" && reply.messageId ? (
        <View accessibilityLabel={guideUi.helpfulLegend} className="flex-row gap-1">
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel={guideUi.helpful}
            accessibilityState={{ selected: rating === 1 }}
            className={cn(rating === 1 && "bg-muted")}
            onPress={() => give(1)}
          >
            <ThumbsUpIcon size={20} color={tokens.foreground} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel={guideUi.notHelpful}
            accessibilityState={{ selected: rating === -1 }}
            className={cn(rating === -1 && "bg-muted")}
            onPress={() => give(-1)}
          >
            <ThumbsDownIcon size={20} color={tokens.foreground} />
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/** The guide's optional one-question check (FR07). Answered on the phone; nothing is saved. */
function CheckQuestion({ check }: { check: GuideCheck }) {
  const tokens = useTokens();
  const [picked, setPicked] = useState<number | null>(null);
  const legend = guideUi.quickCheck(check.question);
  return (
    <View accessibilityLabel={legend} className="gap-2 rounded-xl border border-border p-3">
      <Text className="font-sans-semibold">{legend}</Text>
      {check.options.map((option, index) => (
        <Button
          key={option}
          variant="outline"
          accessibilityLabel={option}
          accessibilityState={{ selected: picked === index, disabled: picked !== null }}
          disabled={picked !== null}
          className={cn(
            "h-auto min-h-11 justify-start py-2",
            picked !== null && index === check.answerIndex && "border-primary bg-secondary",
          )}
          onPress={() => setPicked(index)}
        >
          <Text>{option}</Text>
        </Button>
      ))}
      {picked !== null ? (
        <View accessibilityLiveRegion="polite" className="flex-row items-start gap-2">
          {picked === check.answerIndex ? (
            <CircleCheckIcon size={20} color={tokens.primary} />
          ) : null}
          <Text className="flex-1">
            {`${picked === check.answerIndex ? guideUi.checkRight : guideUi.checkWrong}${check.explanation}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

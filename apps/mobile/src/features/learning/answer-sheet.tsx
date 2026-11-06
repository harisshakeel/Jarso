import {
  describeAnswer,
  playerCopy,
  questCopy,
  renderText,
  type StepBody,
} from "@jarso/core/learning";
import { type JarsoLook, moodFor } from "@jarso/core/mascot";
import { type Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Confetti } from "@/components/celebrate";
import { Button, Text } from "@/components/ui";
import { cn } from "@/lib";
import { playSound } from "@/lib/sound";

export type SheetOutcome = { correct: boolean; feedback: string; final: boolean };

type AnswerSheetProps = {
  outcome: SheetOutcome;
  body: StepBody;
  currency: string;
  topicHref?: Href;
  look?: JarsoLook;
  /** Saving after Continue. */
  pending: boolean;
  onContinue: () => void;
  onTryAgain: () => void;
};

/**
 * Green once it's right; calm blue when it isn't, never red. Rounded all round, sitting inline under the prompt,
 * with its content in a polite live region so the heading is read out.
 */
export function AnswerSheet({
  outcome,
  body,
  currency,
  topicHref,
  look,
  pending,
  onContinue,
  onTryAgain,
}: AnswerSheetProps) {
  const router = useRouter();
  const { correct, final, feedback } = outcome;

  useEffect(() => {
    if (correct) playSound("pop");
  }, [correct]);

  const heading = correct
    ? questCopy.sheet.right
    : final
      ? questCopy.sheet.shown
      : questCopy.sheet.wrong;
  const showPredict = body.type === "predict" && (correct || final);
  const buttonLabel = final ? playerCopy.continue : playerCopy.tryAgain;

  return (
    <View
      className={cn(
        "overflow-hidden rounded-[24px] p-5",
        correct ? "bg-success-soft" : "bg-tint-cyan",
      )}
    >
      <View accessibilityLiveRegion="polite" className="gap-3">
        <View className="flex-row items-center gap-3">
          <Jarso mood={moodFor(correct ? "answerRight" : "answerWrong")} size={96} look={look} />
          <View className="flex-1 gap-1">
            <Text
              accessibilityRole="header"
              className={cn("font-sans-extrabold text-h2", correct && "text-success-text")}
            >
              {heading}
            </Text>
            <Text className="font-sans-semibold">{renderText(feedback, currency)}</Text>
          </View>
        </View>
        {final && !correct ? (
          <Text className="font-sans-semibold">
            {playerCopy.answerLine(describeAnswer(body, currency))}
          </Text>
        ) : null}
        {showPredict && body.type === "predict" ? (
          <Text className="font-sans-semibold">{renderText(body.outcome, currency)}</Text>
        ) : null}
        {!correct && topicHref ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={playerCopy.readAboutTopic}
            onPress={() => router.push(topicHref)}
            className="min-h-11 justify-center"
          >
            <Text className="font-sans-semibold underline">{playerCopy.readAboutTopic}</Text>
          </Pressable>
        ) : null}
      </View>
      <Button
        variant={correct ? "keycap-success" : "keycap"}
        size="xl"
        className="mt-3 w-full"
        accessibilityLabel={buttonLabel}
        loading={final ? pending : false}
        onPress={final ? onContinue : onTryAgain}
      >
        <Text>{buttonLabel}</Text>
      </Button>
      {correct ? <Confetti count={16} /> : null}
    </View>
  );
}

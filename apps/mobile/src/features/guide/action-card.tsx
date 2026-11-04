import type { ActionOutcome, ActionProposal } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  HourglassIcon,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { actionErrorMessage, useTokens } from "@/lib";
import { useConfirmDraft } from "./use-parent-guide";

const OUTCOME_ICON = {
  done: CircleCheckIcon,
  waiting: HourglassIcon,
  declined: CircleAlertIcon,
} as const;

/**
 * An action Jarso prepared for the parent (the web's ActionCard): every field in plain words,
 * "Do it" and "Change something". Jarso never acts: only this tap does, through the app's own
 * service, and the card then says what really happened. Once only: the buttons go with the
 * outcome, and the draft's id keeps a repeat from recording twice on the server.
 */
export function ActionCard({
  proposal,
  childId,
  onChange,
}: {
  proposal: ActionProposal;
  /** The child the chat is about (the draft names it too). */
  childId: string;
  /** "Change something": a short line for the composer. */
  onChange?: (line: string) => void;
}) {
  const tokens = useTokens();
  const copy = guideCopy.action;
  const confirm = useConfirmDraft(childId);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  async function doIt() {
    if (confirm.isPending || outcome) return;
    try {
      setOutcome(await confirm.mutateAsync(proposal.draft));
    } catch (error) {
      setOutcome({ status: "declined", text: await actionErrorMessage(error), figures: null });
    }
  }

  const Icon = outcome ? OUTCOME_ICON[outcome.status] : null;
  return (
    <View accessibilityLabel={proposal.title} className="gap-3 rounded-xl bg-secondary p-3">
      <View className="gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <ClipboardCheckIcon size={16} color={tokens["muted-foreground"]} />
          <Text className="flex-1 font-sans-semibold text-muted-foreground">{copy.eyebrow}</Text>
        </View>
        <Text className="font-sans-bold">{proposal.title}</Text>
      </View>
      <View className="gap-1 rounded-lg bg-card p-3">
        {proposal.lines.map((item) => (
          <View key={item.label} className="flex-row justify-between gap-4">
            <Text className="text-muted-foreground">{item.label}</Text>
            <Text className="flex-1 text-right font-sans-semibold">{item.value}</Text>
          </View>
        ))}
      </View>
      {outcome && Icon ? (
        <View accessibilityLiveRegion="polite" className="gap-1">
          <View
            accessibilityRole={outcome.status === "declined" ? "alert" : "text"}
            className="flex-row items-start gap-2"
          >
            <Icon
              size={20}
              color={outcome.status === "declined" ? tokens.destructive : tokens.primary}
            />
            <Text className="flex-1">{outcome.text}</Text>
          </View>
          {outcome.figures ? (
            <Text className="text-muted-foreground">
              {`Spend ${outcome.figures.spend} · Save ${outcome.figures.save}`}
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <Button
            accessibilityLabel={copy.doIt}
            accessibilityState={{ busy: confirm.isPending, disabled: confirm.isPending }}
            disabled={confirm.isPending}
            onPress={() => void doIt()}
          >
            {confirm.isPending ? <ActivityIndicator color="white" /> : <Text>{copy.doIt}</Text>}
          </Button>
          {onChange ? (
            <Button
              variant="ghost"
              accessibilityLabel={copy.change}
              disabled={confirm.isPending}
              onPress={() => onChange(copy.changePrompt)}
            >
              <Text>{copy.change}</Text>
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

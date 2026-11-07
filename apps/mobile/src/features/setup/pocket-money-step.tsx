import { setupFlowCopy } from "@jarso/core/setup";
import { ActivityIndicator, View } from "react-native";
import { Notice } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { AllowanceForm, useFamilyContext } from "@/features/allowance";
import { toUserMessage } from "@/lib";
import { SetupFrame, StepHeading } from "./setup-frame";

const copy = setupFlowCopy.money;

/**
 * Step 5: the child's pocket money with the allowance editor the parent uses later (amount, how
 * often, first day; plan 7 adds the Spend/Save split inside the editor, so it shows here too).
 * Saving or "Not now" moves on.
 */
export function PocketMoneyStep({
  childId,
  nickname,
  onDone,
}: {
  childId: string;
  nickname: string;
  onDone: () => void;
}) {
  const context = useFamilyContext();
  return (
    <SetupFrame
      step="money"
      footer={
        <Button variant="ghost" accessibilityLabel={copy.notNow} onPress={onDone}>
          <Text>{copy.notNow}</Text>
        </Button>
      }
    >
      <StepHeading title={copy.title(nickname)} line={copy.intro} />
      {context.data ? (
        <AllowanceForm
          childId={childId}
          currency={context.data.currency}
          today={context.data.today}
          onDone={onDone}
        />
      ) : context.error ? (
        <Notice message={toUserMessage(context.error)} />
      ) : (
        <View className="items-center py-8">
          <ActivityIndicator accessibilityLabel="Loading" />
        </View>
      )}
    </SetupFrame>
  );
}

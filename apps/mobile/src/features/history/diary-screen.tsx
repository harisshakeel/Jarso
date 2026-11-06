import { diaryCopy } from "@jarso/core/diary";
import { jarPageCopy } from "@jarso/core/ledger";
import { type Href, useRouter } from "expo-router";
import { View } from "react-native";
import { ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { PendingPurchases, WeekSpentCard } from "@/features/diary";
import { useHome } from "@/features/jars";
import { formatMoney } from "@/lib";
import { HistoryList } from "./history-list";

const [BOUGHT, GOT] = jarPageCopy.actions.spend;

/**
 * The child's money diary (FR04) in one scroll: this week as picture bars, the two money-in and
 * money-out actions, what waits on the phone, then every line (tap one to fix it, undo it or see
 * what it said before).
 */
export function DiaryScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const home = useHome().data;
  const context = home?.context;
  const jars = home?.jars;
  return (
    <HistoryList
      header={
        <View className="mb-2 gap-4">
          <ScreenHeader
            title={diaryCopy.heading}
            trailing={
              jars && context ? (
                <View
                  accessible
                  accessibilityLabel={diaryCopy.spendJarLabel}
                  className="rounded-full bg-tint-teal px-3 py-1.5"
                >
                  <Text className="font-sans-bold text-small">
                    {`${formatMoney(jars.spend, context.currency, { showMinor: "nonzero" })} ${diaryCopy.inSpend}`}
                  </Text>
                </View>
              ) : null
            }
          />
          {context ? <WeekSpentCard context={context} /> : null}
          <View className="flex-row gap-3">
            {[
              { action: BOUGHT, variant: "keycap" as const },
              { action: GOT, variant: "keycap-white" as const },
            ].map(({ action, variant }) =>
              action ? (
                <Button
                  key={action.href}
                  variant={variant}
                  size="xl"
                  accessibilityLabel={action.label}
                  onPress={() => router.push(action.href as Href)}
                  className="flex-1 flex-col gap-0 px-3"
                >
                  <Text className="text-center">{action.label}</Text>
                  <Text className="text-center font-sans text-caption opacity-80">
                    {action.hint}
                  </Text>
                </Button>
              ) : null,
            )}
          </View>
          {userId && context ? (
            <PendingPurchases userId={userId} currency={context.currency} />
          ) : null}
        </View>
      }
    />
  );
}

import { diaryCopy, receivedCopy } from "@jarso/core/diary";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { PendingPurchases, WhereItWentCard } from "@/features/diary";
import { useHome } from "@/features/jars";
import { formatMoney } from "@/lib";
import { HistoryList } from "./history-list";

/**
 * The child's money diary (FR04), the web's Diary in one scroll: what Spend holds, where the
 * money went this week, record a purchase or money received, what waits on the phone, then
 * every line (tap one to fix it, undo it or see what it said before).
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
          <ScreenHeader title={diaryCopy.heading} />
          {jars && context ? (
            <Text accessibilityLabel={diaryCopy.spendJarLabel}>
              {`${diaryCopy.youHave} ${formatMoney(jars.spend, context.currency, { showMinor: "nonzero" })} ${diaryCopy.inSpend}`}
            </Text>
          ) : null}
          {context ? <WhereItWentCard context={context} /> : null}
          <Button
            size="lg"
            accessibilityLabel="Spent something?"
            onPress={() => router.push("/(child)/purchase")}
          >
            <Text>Spent something?</Text>
          </Button>
          <Button
            size="lg"
            variant="outline"
            accessibilityLabel={receivedCopy.trigger}
            onPress={() => router.push("/(child)/received")}
          >
            <Text>{receivedCopy.trigger}</Text>
          </Button>
          {userId && context ? (
            <PendingPurchases userId={userId} currency={context.currency} />
          ) : null}
        </View>
      }
    />
  );
}

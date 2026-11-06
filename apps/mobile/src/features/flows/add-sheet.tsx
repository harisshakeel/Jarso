import { addSheetCopy, type MoneyActionKey, moneyActions } from "@jarso/core/home";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";
import { pictureIcon, TINT } from "./icons";

type AddSheetProps = {
  /** What the child calls their parent ("Mum"). */
  parent: string;
  /** Asks still open (waiting or approved); the My asks row shows the count when above 0. */
  waiting: number;
  onPick: (key: MoneyActionKey) => void;
  onAsks: () => void;
  onClose: () => void;
};

/** "What happened?": five picture tiles for the moments money moves, then My asks. */
export function AddSheet({ parent, waiting, onPick, onAsks, onClose }: AddSheetProps) {
  const tokens = useTokens();
  const Close = pictureIcon("x");
  return (
    <View className="flex-1 gap-4 bg-background px-4 pt-2">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-sans-extrabold text-h1">
          {addSheetCopy.title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addSheetCopy.close}
          onPress={onClose}
          className="size-11 items-center justify-center rounded-full bg-muted"
        >
          <Close size={22} color={tokens.foreground} />
        </Pressable>
      </View>
      <ScrollView contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
        <View className="flex-row flex-wrap gap-3">
          {moneyActions(parent).map((action, i, all) => {
            const Icon = pictureIcon(action.icon);
            const tint = TINT[action.tint];
            const wide = i === all.length - 1 && all.length % 2 === 1;
            return (
              <Pressable
                key={action.key}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => onPick(action.key)}
                className={cn(
                  "min-h-28 grow justify-center gap-2 rounded-xl border-2 border-border bg-card p-3 active:bg-muted",
                  wide ? "w-full" : "w-[47%]",
                )}
              >
                <View className={cn("size-12 items-center justify-center rounded-xl", tint.box)}>
                  <Icon size={26} color={tokens[tint.icon]} />
                </View>
                <View>
                  <Text className="font-sans-bold">{action.label}</Text>
                  <Text className="text-small text-muted-foreground">{action.hint}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addSheetCopy.myAsks}
          onPress={onAsks}
          className="min-h-14 flex-row items-center justify-between rounded-xl bg-muted px-4 active:opacity-80"
        >
          <Text className="font-sans-bold">{addSheetCopy.myAsks}</Text>
          {waiting > 0 ? (
            <View className="rounded-full bg-tint-gold px-3 py-1">
              <Text className="font-sans-bold text-small">{addSheetCopy.waiting(waiting)}</Text>
            </View>
          ) : null}
        </Pressable>
      </ScrollView>
    </View>
  );
}

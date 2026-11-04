import { ChevronRightIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { useTokens } from "@/lib";

/**
 * One row of a list inside a `Card` (lists over stacked cards, spec §9): label, an optional
 * muted detail line, and whatever trails it. With `onPress` it is a 48 dp button with a chevron.
 */
export function ListRow({
  label,
  detail,
  trailing,
  onPress,
  accessibilityRole = "button",
  accessibilityLabel,
}: {
  label: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityRole?: "button" | "link";
  accessibilityLabel?: string;
}) {
  const tokens = useTokens();
  const body = (
    <>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-sans-semibold">{label}</Text>
        {detail ? <Text className="text-small text-muted-foreground">{detail}</Text> : null}
      </View>
      {trailing}
      {onPress ? <ChevronRightIcon size={20} color={tokens["muted-foreground"]} /> : null}
    </>
  );
  if (!onPress) {
    return <View className="min-h-12 flex-row items-center gap-3">{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className="min-h-12 flex-row items-center gap-3 active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

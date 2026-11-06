import { PiggyBankIcon, WalletIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

const JARS = {
  spend: {
    name: "Spend",
    Icon: WalletIcon,
    fill: "bg-teal-700",
    ink: "text-white",
    icon: "white" as const,
  },
  save: {
    name: "Save",
    Icon: PiggyBankIcon,
    fill: "bg-gold",
    ink: "text-gold-foreground",
    icon: null,
  },
} as const;

type JarTileProps = {
  jar: "spend" | "save";
  amount: string;
  caption: string;
  /** Leave unset and the tile is a plain group, not a button. */
  onPress?: () => void;
};

/** A solid Spend (teal) or Save (gold) tile: the jar's name, its amount, one short caption. */
export function JarTile({ jar, amount, caption, onPress }: JarTileProps) {
  const tokens = useTokens();
  const { name, Icon, fill, ink, icon: iconColor } = JARS[jar];
  const icon = iconColor ?? tokens["gold-foreground"];
  const body = (
    <>
      <View className="flex-row items-center gap-1.5">
        <Icon size={18} color={icon} />
        <Text className={cn("font-sans-bold", ink)}>{name}</Text>
      </View>
      <View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          className={cn("font-sans-extrabold text-money-xl", ink)}
        >
          {amount}
        </Text>
        <Text numberOfLines={1} className={cn("text-small", ink)}>
          {caption}
        </Text>
      </View>
    </>
  );
  const style = cn("h-[110px] flex-1 justify-between rounded-3xl p-3.5", fill);
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name} ${amount}`}
        onPress={onPress}
        className={style}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={`${name} ${amount}, ${caption}`} className={style}>
      {body}
    </View>
  );
}

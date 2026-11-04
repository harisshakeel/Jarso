import { View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

const tones = {
  ok: "bg-tint-success",
  warn: "bg-tint-gold",
  error: "bg-tint-danger",
} as const;

/** A tinted note in a card block (mockup F, G): a bold title and an optional plain line. */
export function CardNote({
  tone,
  title,
  detail,
}: {
  tone: keyof typeof tones;
  title: string;
  detail?: string | null;
}) {
  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      className={cn("gap-0.5 rounded-xl px-3 py-2.5", tones[tone])}
    >
      <Text className="font-sans-bold">{title}</Text>
      {detail ? <Text>{detail}</Text> : null}
    </View>
  );
}

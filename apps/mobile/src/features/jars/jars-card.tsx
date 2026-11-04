import type { ReactNode } from "react";
import { View } from "react-native";
import { Card } from "@/components/screen";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

export type JarHalf = {
  name: string;
  amount: string;
  /** What the jar is, read out as the half's hint ("Cash you have"). */
  caption: string;
  /** How full the jar looks, 0 to 1, on the scale shared by both jars. */
  share: number;
  /** Lines under the jars: what is waiting or held, in the web's words. */
  notes: string[];
};

/**
 * Both jars in one card (mockup B): the total, Spend and Save side by side with a small jar
 * drawing each, what is held or waiting, then the two quick actions. Save's amount is the card's
 * one accent (gold money).
 */
export function JarsCard({
  spend,
  save,
  total,
  actions,
}: {
  spend: JarHalf;
  save: JarHalf;
  total: string;
  actions: ReactNode;
}) {
  const notes = [...spend.notes, ...save.notes];
  return (
    <Card accessibilityLabel="Your jars">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text accessibilityRole="header" className="font-sans-bold text-h2">
          Your jars
        </Text>
        <Text className="text-small text-muted-foreground">{total}</Text>
      </View>
      <View className="flex-row gap-4">
        <Half jar="spend" half={spend} />
        <Half jar="save" half={save} />
      </View>
      {notes.map((note) => (
        <Text key={note} className="text-muted-foreground">
          {note}
        </Text>
      ))}
      <View className="flex-row gap-3">{actions}</View>
    </Card>
  );
}

function Half({ jar, half }: { jar: "spend" | "save"; half: JarHalf }) {
  const fill = Math.round(Math.min(Math.max(half.share, 0), 1) * 100);
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${half.name} jar`}
      accessibilityHint={half.caption}
      className="min-w-0 flex-1 flex-row items-center gap-2.5"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="items-center"
      >
        <View className="h-1 w-4 rounded-sm bg-primary" />
        <View className="h-[30px] w-7 justify-end overflow-hidden rounded-b-lg rounded-t-sm border-2 border-primary bg-background">
          <View
            testID={`${jar}-fill`}
            style={{ height: `${fill}%` }}
            className={cn("w-full", jar === "spend" ? "bg-cyan-400" : "bg-gold")}
          />
        </View>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-sans-semibold text-small text-muted-foreground">{half.name}</Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          className={cn("font-sans-extrabold text-money-l", jar === "save" && "text-gold-text")}
        >
          {half.amount}
        </Text>
      </View>
    </View>
  );
}

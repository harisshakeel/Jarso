import { palette } from "@jarso/brand/tokens";
import { setupFlowCopy } from "@jarso/core/setup";
import { HandCoinsIcon, SparklesIcon } from "lucide-react-native";
import { type ComponentRef, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Jarso } from "@/components/brand";
import { Button, Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

const copy = setupFlowCopy.how;
type Card = (typeof copy.cards)[number];

function Picture({ card }: { card: Card }) {
  const tokens = useTokens();
  if (card.key === "jars") {
    return (
      <View className="flex-row items-end justify-center gap-6">
        <Jarso tint="spend" size={110} />
        <Jarso tint="save" fill={0.5} size={110} />
      </View>
    );
  }
  const Icon = card.key === "ask" ? HandCoinsIcon : SparklesIcon;
  return (
    <View
      className={cn(
        "h-28 w-28 items-center justify-center self-center rounded-3xl",
        card.key === "ask" ? "bg-tint-gold" : "bg-tint-grape",
      )}
    >
      <Icon size={56} color={card.key === "ask" ? tokens["gold-text"] : palette.grape["600"]} />
    </View>
  );
}

/**
 * Step 2: how Jarso works in three cards the parent swipes (or steps through with Next). Skip
 * and Next on the last card go on to the account.
 */
export function HowItWorks({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  const last = index === copy.cards.length - 1;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (page !== index) setIndex(Math.min(Math.max(page, 0), copy.cards.length - 1));
  };

  const next = () => {
    if (last) return onDone();
    const page = index + 1;
    setIndex(page);
    scroller.current?.scrollTo({ x: page * width, animated: true });
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="min-h-12 flex-row items-center justify-end px-2 pt-2">
        <Button variant="ghost" size="sm" accessibilityLabel={setupFlowCopy.skip} onPress={onDone}>
          <Text>{setupFlowCopy.skip}</Text>
        </Button>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        className="flex-1"
      >
        {copy.cards.map((card, i) => (
          <View
            key={card.key}
            style={{ width }}
            className="justify-center gap-6 px-6"
            accessibilityElementsHidden={i !== index}
            importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}
          >
            <Picture card={card} />
            <View className="gap-3 rounded-3xl bg-card p-6">
              <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
                {card.title}
              </Text>
              <Text className="text-ink-2">{card.body}</Text>
              <Text className="font-sans-semibold">{card.note}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View className="gap-4 px-6 pb-6">
        <View
          accessible
          accessibilityLabel={copy.cardLabel(index + 1, copy.cards.length)}
          className="flex-row justify-center gap-1.5"
        >
          {copy.cards.map((card, i) => (
            <View
              key={card.key}
              className={cn("h-2 rounded-full", i === index ? "w-6 bg-primary" : "w-2 bg-muted")}
            />
          ))}
        </View>
        <Button variant="keycap" size="lg" accessibilityLabel={setupFlowCopy.next} onPress={next}>
          <Text>{setupFlowCopy.next}</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}

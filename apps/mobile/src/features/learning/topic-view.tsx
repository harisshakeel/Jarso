import type { Topic } from "@jarso/core/learning";
import { learnCopy, renderText } from "@jarso/core/learning";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";

/** A topic's explanation and worked example (FR08). The practice question renders below it. */
export function TopicView({ topic, currency }: { topic: Topic; currency: string }) {
  const [more, setMore] = useState(false);
  const shown = more ? topic.explanation : topic.explanation.slice(0, 2);
  return (
    <View className="gap-5">
      <Text className="text-lg text-muted-foreground">{renderText(topic.intro, currency)}</Text>
      <View className="gap-3">
        {shown.map((paragraph) => (
          <Text key={paragraph}>{renderText(paragraph, currency)}</Text>
        ))}
        {topic.explanation.length > 2 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: more }}
            accessibilityLabel={more ? learnCopy.topic.enough : learnCopy.topic.tellMore}
            onPress={() => setMore((open) => !open)}
            className="min-h-11 justify-center self-start"
          >
            <Text className="font-sans-semibold text-primary">
              {more ? learnCopy.topic.enough : learnCopy.topic.tellMore}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View className="gap-2 rounded-2xl bg-secondary p-5">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {topic.example.title}
        </Text>
        {topic.example.lines.map((line, index) => (
          <Text key={line} className="text-secondary-foreground">
            {`${index + 1}. ${renderText(line, currency)}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

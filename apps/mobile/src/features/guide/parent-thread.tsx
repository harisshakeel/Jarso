import { guideCopy } from "@jarso/core/guide";
import { useState } from "react";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { GuideThread, type Kid, type ReopenedChat } from "./thread";

/**
 * The parent's chat with Jarso about one child (the web's JarsoPageThread for a parent): a chip
 * per child Jarso is on for when there is more than one, then the thread. Picking another child
 * starts a new chat about them; a reopened chat stays about the child it was about.
 */
export function ParentThread({
  kids,
  person,
  reopened,
}: {
  /** The parent's children Jarso is on for, in the family's order; the first starts picked. */
  kids: Kid[];
  /** The parent's first name, for the greeting over a new chat. */
  person: string;
  reopened?: ReopenedChat & { kid: Kid };
}) {
  const [kidId, setKidId] = useState<string | null>(null);
  // A child whose Jarso was turned off since drops out of the chips: the first one takes over.
  const kid = reopened?.kid ?? kids.find((k) => k.id === kidId) ?? kids[0];
  if (!kid) return null;
  const picker = kids.length > 1 && !reopened;
  return (
    <View className="flex-1">
      {reopened ? null : (
        <View className="gap-3 px-4 pt-2">
          <Text className="font-sans-bold text-h3">
            {guideCopy.greeting.parent(person, kid.nickname)}
          </Text>
          {picker ? (
            <View
              accessibilityLabel={guideCopy.parent.pick}
              className="flex-row flex-wrap items-center gap-2"
            >
              <Text className="text-muted-foreground">{guideCopy.parent.pick}</Text>
              {kids.map((k) => (
                <Button
                  key={k.id}
                  variant={k.id === kid.id ? "secondary" : "outline"}
                  accessibilityLabel={k.nickname}
                  accessibilityState={{ selected: k.id === kid.id }}
                  onPress={() => setKidId(k.id)}
                >
                  <Text>{k.nickname}</Text>
                </Button>
              ))}
            </View>
          ) : null}
        </View>
      )}
      <GuideThread
        // A new child or a reopened chat is a new thread.
        key={reopened ? reopened.conversationId : `new-${kid.id}`}
        audience="parent"
        kid={kid}
        context={{ entry: "parent", childId: kid.id }}
        introNeeded={false}
        suggestions={guideCopy.parent.suggestions(kid.nickname)}
        reopened={reopened}
      />
    </View>
  );
}

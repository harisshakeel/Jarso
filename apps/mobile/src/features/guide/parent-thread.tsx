import { guideCopy } from "@jarso/core/guide";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { useTokens } from "@/lib";
import { GuideThread, type Kid, type ReopenedChat } from "./thread";

/**
 * The parent's chat with Jarso about one child (the web's JarsoPageThread for a parent): with more
 * than one child Jarso is on for, a folded "Ask about" picker, then the thread. Picking another child
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
        <View className="gap-2 px-4 pt-1">
          <Text className="text-muted-foreground">
            {guideCopy.greeting.parent(person, kid.nickname)}
          </Text>
          {picker ? <KidPicker kids={kids} picked={kid} onPick={setKidId} /> : null}
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

/**
 * "Ask about" with only the picked child showing; a tap unfolds the others as chips, and picking
 * one folds it again. Keeps the chat's header to one short row.
 */
function KidPicker({
  kids,
  picked,
  onPick,
}: {
  kids: Kid[];
  picked: Kid;
  onPick: (id: string) => void;
}) {
  const tokens = useTokens();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  const others = kids.filter((k) => k.id !== picked.id);
  return (
    <View
      accessibilityLabel={guideCopy.parent.pick}
      className="flex-row flex-wrap items-center gap-2"
    >
      <Text className="text-muted-foreground">{guideCopy.parent.pick}</Text>
      <Button
        size="sm"
        variant="secondary"
        accessibilityLabel={`${guideCopy.parent.pick} ${picked.nickname}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
      >
        <Text>{picked.nickname}</Text>
        <Chevron size={16} color={tokens["secondary-foreground"]} />
      </Button>
      {open
        ? others.map((k) => (
            <Button
              key={k.id}
              size="sm"
              variant="outline"
              accessibilityLabel={k.nickname}
              accessibilityState={{ selected: false }}
              onPress={() => {
                onPick(k.id);
                setOpen(false);
              }}
            >
              <Text>{k.nickname}</Text>
            </Button>
          ))
        : null}
    </View>
  );
}

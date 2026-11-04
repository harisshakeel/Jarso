import type { Memory } from "@jarso/core/guide";
import { guideCopy, parentGuideCopy } from "@jarso/core/guide";
import { BrainIcon, XIcon } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { toUserMessage, useTokens } from "@/lib";
import type { Kid } from "./thread";
import { useForgetMemory, useMemories } from "./use-guide";
import { useGuideState } from "./use-guide-state";

/**
 * "What Jarso remembers": every fact Jarso kept, each with Forget, so nothing it keeps is ever
 * hidden from the child or their parent. In Me (no `child`) it shows while the guide is on, and
 * whenever any memory exists even with Jarso off. On a child's chats page (`child`) the parent
 * reads that child's; the page decides when to show it.
 */
export function MemoryList({ child }: { child?: Kid } = {}) {
  return child ? <ChildMemories child={child} /> : <OwnMemories />;
}

function OwnMemories() {
  const guide = useGuideState();
  const memories = useMemories();
  const list = memories.data ?? [];
  if (!(guide.data?.available === true || list.length > 0)) return null;
  return <MemoryCard intro={guideCopy.memories.intro} list={list} />;
}

function ChildMemories({ child }: { child: Kid }) {
  const memories = useMemories(child.id);
  if (!memories.data) {
    return memories.error ? (
      <Text accessibilityRole="alert">{toUserMessage(memories.error)}</Text>
    ) : null;
  }
  return (
    <MemoryCard
      intro={parentGuideCopy.memoriesIntro(child.nickname)}
      list={memories.data}
      childId={child.id}
    />
  );
}

function MemoryCard({ intro, list, childId }: { intro: string; list: Memory[]; childId?: string }) {
  const tokens = useTokens();
  return (
    <View className="gap-3 rounded-xl bg-card p-4">
      <View className="flex-row items-center gap-2">
        <BrainIcon size={20} color={tokens.foreground} />
        <Text accessibilityRole="header" className="font-sans-extrabold text-h3">
          {guideCopy.memories.title}
        </Text>
      </View>
      <Text className="text-muted-foreground">{intro}</Text>
      {list.length === 0 ? (
        <Text className="text-muted-foreground">{guideCopy.memories.empty}</Text>
      ) : (
        <View className="gap-2">
          {list.map((memory) => (
            <MemoryRow key={memory.id} memory={memory} childId={childId} />
          ))}
        </View>
      )}
    </View>
  );
}

function MemoryRow({ memory, childId }: { memory: Memory; childId?: string }) {
  const tokens = useTokens();
  const forget = useForgetMemory(childId);
  const label = `${guideCopy.memories.forget}: ${memory.text}`;
  return (
    <View className="gap-1 rounded-xl border border-border px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1">
          <Text className="text-muted-foreground">
            {`${guideCopy.memories.kinds[memory.kind]}: `}
          </Text>
          {memory.text}
        </Text>
        <Button
          variant="ghost"
          accessibilityLabel={label}
          accessibilityState={{ busy: forget.isPending, disabled: forget.isPending }}
          disabled={forget.isPending}
          onPress={() => forget.mutate(memory.id)}
        >
          {forget.isPending ? (
            <ActivityIndicator />
          ) : (
            <>
              <XIcon size={16} color={tokens.foreground} />
              <Text>{guideCopy.memories.forget}</Text>
            </>
          )}
        </Button>
      </View>
      {forget.error ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {toUserMessage(forget.error)}
        </Text>
      ) : null}
    </View>
  );
}

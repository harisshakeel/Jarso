import type { Memory } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import { BrainIcon, XIcon } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { toUserMessage, useTokens } from "@/lib";
import { useForgetMemory, useMemories } from "./use-guide";
import { useGuideState } from "./use-guide-state";

/**
 * "What Jarso remembers" in Me: every fact Jarso kept, each with Forget. Shown while the guide is
 * on, and whenever any memory exists even with Jarso off, so the child can always forget them.
 */
export function MemoryList() {
  const tokens = useTokens();
  const guide = useGuideState();
  const memories = useMemories();
  const list = memories.data ?? [];
  if (!(guide.data?.available === true || list.length > 0)) return null;
  return (
    <View className="gap-3 rounded-xl bg-card p-4">
      <View className="flex-row items-center gap-2">
        <BrainIcon size={20} color={tokens.foreground} />
        <Text accessibilityRole="header" className="font-sans-extrabold text-h3">
          {guideCopy.memories.title}
        </Text>
      </View>
      <Text className="text-muted-foreground text-sm">{guideCopy.memories.intro}</Text>
      {list.length === 0 ? (
        <Text className="text-muted-foreground">{guideCopy.memories.empty}</Text>
      ) : (
        <View className="gap-2">
          {list.map((memory) => (
            <MemoryRow key={memory.id} memory={memory} />
          ))}
        </View>
      )}
    </View>
  );
}

function MemoryRow({ memory }: { memory: Memory }) {
  const tokens = useTokens();
  const forget = useForgetMemory();
  const label = `${guideCopy.memories.forget}: ${memory.text}`;
  return (
    <View className="gap-1 rounded-xl border border-border px-4 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1">
          <Text className="text-muted-foreground text-sm">
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
        <Text accessibilityRole="alert" className="text-destructive text-sm">
          {toUserMessage(forget.error)}
        </Text>
      ) : null}
    </View>
  );
}

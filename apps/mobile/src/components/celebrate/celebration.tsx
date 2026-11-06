import * as Haptics from "expo-haptics";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo } from "react-native";
import { logger } from "@/lib";
import { getSoundOn, playSound } from "@/lib/sound";
import { type Celebration, CelebrationView } from "./celebration-view";

type Queued = { id: number; celebration: Celebration };

const CelebrateContext = createContext<((c: Celebration) => void) | null>(null);

/**
 * Holds the child's celebrations. `celebrate()` calls queue up and show one at a time, each with
 * its sound, a success haptic and its title read out.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const nextId = useRef(0);
  // The closed celebration's button action, run once it has left the screen.
  const after = useRef<(() => void) | undefined>(undefined);
  const closing = useRef<number | null>(null);
  const current = queue[0];

  // Reads the sound setting now, so the first celebration's clip already respects it.
  useEffect(() => {
    void getSoundOn();
  }, []);

  const celebrate = useCallback((celebration: Celebration) => {
    nextId.current += 1;
    const id = nextId.current;
    setQueue((q) => [...q, { id, celebration }]);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: once per celebration shown
  useEffect(() => {
    const then = after.current;
    after.current = undefined;
    // A screen's own action must not take the child area down with it.
    try {
      then?.();
    } catch (error) {
      logger.warn("celebration action failed", { error });
    }
    if (!current) return;
    const { celebration } = current;
    playSound(celebration.sound ?? "cheer");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    AccessibilityInfo.announceForAccessibility(celebration.title);
  }, [current?.id]);

  // A second tap on the way out does nothing: only the celebration on screen closes.
  const close = useCallback((id: number, then?: () => void) => {
    if (closing.current === id) return;
    closing.current = id;
    after.current = then;
    setQueue((q) => (q[0]?.id === id ? q.slice(1) : q));
  }, []);

  return (
    <CelebrateContext.Provider value={celebrate}>
      {children}
      {current ? (
        <CelebrationView
          key={current.id}
          celebration={current.celebration}
          onPrimary={() => close(current.id, current.celebration.primary.onPress)}
          onSecondary={() => close(current.id, current.celebration.secondary?.onPress)}
        />
      ) : null}
    </CelebrateContext.Provider>
  );
}

/**
 * `celebrate(c)` for a child screen. Child area only: `CelebrationProvider` sits in the child
 * layout, and outside it this hook throws. Android back on a celebration does what its primary
 * button does: it closes, then runs `primary.onPress`. An `onPress` that throws is logged, not
 * rethrown, and one that calls `celebrate()` again queues the next celebration as usual.
 */
export function useCelebrate(): (c: Celebration) => void {
  const celebrate = useContext(CelebrateContext);
  if (!celebrate) throw new Error("useCelebrate needs a CelebrationProvider above it");
  return celebrate;
}

import { levelUpCopy, progressCopy } from "@jarso/core/progress";
import { getProgress, setJarsoLook } from "@jarso/data/progress";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useLevelUp } from "@/features/progress";

const mockCelebrate = jest.fn();
jest.mock("@/components/celebrate", () => ({ useCelebrate: () => mockCelebrate }));
let mockUserId = "u1";
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: mockUserId }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@jarso/data/progress", () => ({
  getProgress: jest.fn(),
  setJarsoLook: jest.fn(),
  dailyCheckin: jest.fn(),
}));
jest.mock("@jarso/data/family", () => ({ findParentLabels: jest.fn() }));

const LOOK = { lid: "grape", wear: "cap" } as const;
const at = (level: number, sparks: number) => ({ sparks, level, look: LOOK, badges: [] });

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return await renderHook(() => useLevelUp(), { wrapper });
}

/** Lets the stored-level read and the effect settle. */
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(async () => {
  jest.clearAllMocks();
  mockUserId = "u1";
  await AsyncStorage.clear();
  (setJarsoLook as jest.Mock).mockResolvedValue(undefined);
});

describe("useLevelUp", () => {
  it("first run stores the level and does not celebrate", async () => {
    (getProgress as jest.Mock).mockResolvedValue(at(4, 500));
    await setup();
    await waitFor(async () => expect(await AsyncStorage.getItem("jarso-level-seen:u1")).toBe("4"));
    await settle();
    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it("a rise celebrates once with the unlocked wear and stores the level", async () => {
    await AsyncStorage.setItem("jarso-level-seen:u1", "4");
    (getProgress as jest.Mock).mockResolvedValue(at(5, 700));
    await setup();
    await waitFor(() => expect(mockCelebrate).toHaveBeenCalledTimes(1));
    const shown = mockCelebrate.mock.calls[0][0];
    expect(shown.title).toBe(progressCopy.levelUp(5, "Money Maker"));
    expect(shown.mood).toBe("wow");
    expect(shown.tone).toBe("grape");
    expect(shown.look).toEqual({ lid: "grape", wear: "crown" });
    expect(shown.chips).toEqual([{ icon: "unlock", label: "Crown unlocked" }]);
    expect(shown.primary.label).toBe(levelUpCopy.wearIt);
    expect(shown.secondary.label).toBe(levelUpCopy.later);
    expect(await AsyncStorage.getItem("jarso-level-seen:u1")).toBe("5");
    await settle();
    expect(mockCelebrate).toHaveBeenCalledTimes(1);
  });

  it("Wear it puts the new wear on", async () => {
    await AsyncStorage.setItem("jarso-level-seen:u1", "4");
    (getProgress as jest.Mock).mockResolvedValue(at(5, 700));
    await setup();
    await waitFor(() => expect(mockCelebrate).toHaveBeenCalled());
    await act(async () => mockCelebrate.mock.calls[0][0].primary.onPress());
    await waitFor(() =>
      expect(setJarsoLook).toHaveBeenCalledWith({ id: "client" }, { lid: "grape", wear: "crown" }),
    );
  });

  it("a rise with no new look offers Yay! only", async () => {
    await AsyncStorage.setItem("jarso-level-seen:u1", "1");
    (getProgress as jest.Mock).mockResolvedValue(at(2, 120));
    await setup();
    await waitFor(() => expect(mockCelebrate).toHaveBeenCalledTimes(1));
    const shown = mockCelebrate.mock.calls[0][0];
    expect(shown.primary).toEqual({ label: levelUpCopy.yay });
    expect(shown.secondary).toBeUndefined();
    expect(shown.chips).toBeUndefined();
    expect(shown.look).toEqual(LOOK);
  });

  it("the same level again does not celebrate", async () => {
    await AsyncStorage.setItem("jarso-level-seen:u1", "3");
    (getProgress as jest.Mock).mockResolvedValue(at(3, 300));
    await setup();
    await waitFor(() => expect(getProgress).toHaveBeenCalled());
    await settle();
    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it("storage failure still celebrates only once this run", async () => {
    await AsyncStorage.setItem("jarso-level-seen:u1", "2");
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("full"));
    (getProgress as jest.Mock).mockResolvedValue(at(3, 260));
    const { rerender } = await setup();
    await waitFor(() => expect(mockCelebrate).toHaveBeenCalledTimes(1));
    await rerender({});
    await settle();
    expect(mockCelebrate).toHaveBeenCalledTimes(1);
  });

  it("each child has their own stored level", async () => {
    await AsyncStorage.setItem("jarso-level-seen:u1", "5");
    mockUserId = "u2";
    (getProgress as jest.Mock).mockResolvedValue(at(5, 700));
    await setup();
    await waitFor(async () => expect(await AsyncStorage.getItem("jarso-level-seen:u2")).toBe("5"));
    await settle();
    expect(mockCelebrate).not.toHaveBeenCalled();
  });
});

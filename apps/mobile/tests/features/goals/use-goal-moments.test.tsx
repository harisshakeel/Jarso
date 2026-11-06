import type { GoalView } from "@jarso/core/goals";
import { findLatestSchedule } from "@jarso/data/allowance";
import { callMarkCelebrated } from "@jarso/data/goals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCelebrate } from "@/components/celebrate";
import { useGoalMoments, useSavingPace } from "@/features/goals";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@/components/celebrate", () => ({ useCelebrate: jest.fn() }));
jest.mock("@/features/progress", () => ({ useParentLabel: () => "Mum" }));
jest.mock("@jarso/data/goals", () => ({ callMarkCelebrated: jest.fn(), getGoalView: jest.fn() }));
jest.mock("@jarso/data/allowance", () => ({ findLatestSchedule: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));

const celebrate = jest.fn();
const push = jest.fn();

function view(fill: number, over: Partial<NonNullable<GoalView>["goal"]> = {}): GoalView {
  const target = 4500;
  const counted = Math.round(target * fill);
  return {
    goal: {
      id: "goal-1",
      name: "Football boots",
      emoji: "⚽",
      targetMinor: target,
      planMinor: 500,
      reachedAt: null,
      celebratedAt: null,
      ...over,
    },
    progress: {
      countedMinor: counted,
      remainingMinor: Math.max(target - counted, 0),
      paymentsLeft: 0,
      fillRatio: Math.min(fill, 1),
      reached: fill >= 1,
    },
  } as NonNullable<GoalView>;
}

async function setup(initial: GoalView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const utils = await renderHook(({ v }: { v: GoalView }) => useGoalMoments(v, "INR"), {
    wrapper,
    initialProps: { v: initial },
  });
  return { client, ...utils };
}

const stored = () => AsyncStorage.getItem("jarso.goalStars.goal-1");
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (useCelebrate as jest.Mock).mockReturnValue(celebrate);
  (useRouter as jest.Mock).mockReturnValue({ push });
  (callMarkCelebrated as jest.Mock).mockResolvedValue(undefined);
});

describe("useGoalMoments", () => {
  it("first sight stores the stars and does not cheer", async () => {
    await setup(view(0.6));
    await waitFor(async () => expect(await stored()).toBe("2"));
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("a new star cheers once, with no reward chip", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "1");
    const { rerender } = await setup(view(0.5));
    await waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
    expect(celebrate).toHaveBeenCalledWith(
      expect.objectContaining({
        sheet: true,
        title: "Halfway there!",
        primary: { label: "Nice!" },
      }),
    );
    expect(celebrate.mock.calls[0][0].chips).toBeUndefined();
    await rerender({ v: view(0.5) });
    await settle();
    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(await stored()).toBe("2");
  });

  it("lowering the target cheers once for the highest star", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "0");
    await setup(view(0.8));
    await waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
    expect(celebrate.mock.calls[0][0].title).toBe("Almost there!");
  });

  it("stars going down never cheer and never lower the stored count", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "3");
    const { rerender } = await setup(view(0.3));
    await settle();
    await rerender({ v: view(0.55) });
    await settle();
    expect(celebrate).not.toHaveBeenCalled();
    expect(await stored()).toBe("3");
  });

  it("reached goal celebrates once, then marks it celebrated", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "3");
    const reached = view(1, { reachedAt: "2026-11-05T10:00:00Z" });
    const { rerender } = await setup(reached);
    await waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
    const c = celebrate.mock.calls[0][0];
    expect(c).toMatchObject({
      title: "You did it!",
      subtitle: "₹45 saved for your Football boots",
      tone: "gold",
      primary: { label: "Ask Mum to buy it" },
      secondary: { label: "Keep saving" },
    });
    expect(c.sheet).toBeUndefined();
    expect(c.chips).toBeUndefined();
    c.primary.onPress();
    expect(push).toHaveBeenCalledWith("/(child)/take-out");
    await waitFor(() => expect(callMarkCelebrated).toHaveBeenCalledTimes(1));
    expect(callMarkCelebrated).toHaveBeenCalledWith({}, "goal-1");
    await rerender({ v: reached });
    await settle();
    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(callMarkCelebrated).toHaveBeenCalledTimes(1);
  });

  it("marking writes celebratedAt into the cached goal", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "4");
    const reached = view(1, { reachedAt: "2026-11-05T10:00:00Z" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(keys.goal("child-1"), reached);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await renderHook(() => useGoalMoments(reached, "INR"), { wrapper });
    await waitFor(() =>
      expect(
        (client.getQueryData(keys.goal("child-1")) as NonNullable<GoalView>).goal.celebratedAt,
      ).not.toBeNull(),
    );
  });

  it("an already celebrated goal does not celebrate", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "4");
    await setup(
      view(1, { reachedAt: "2026-11-05T10:00:00Z", celebratedAt: "2026-11-05T11:00:00Z" }),
    );
    await settle();
    expect(celebrate).not.toHaveBeenCalled();
    expect(callMarkCelebrated).not.toHaveBeenCalled();
  });

  it("two mounts of the same goal cheer once", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "1");
    await setup(view(0.5));
    await setup(view(0.5));
    await waitFor(() => expect(celebrate).toHaveBeenCalled());
    await settle();
    expect(celebrate).toHaveBeenCalledTimes(1);
  });

  it("two mounts of a reached goal celebrate once, even before the mark lands", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "4");
    let release: () => void = () => {};
    (callMarkCelebrated as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const reached = view(1, { reachedAt: "2026-11-05T10:00:00Z" });
    await setup(reached);
    await setup(reached);
    await waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
    await settle();
    expect(celebrate).toHaveBeenCalledTimes(1);
    release();
    await settle();
    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(callMarkCelebrated).toHaveBeenCalledTimes(1);
  });

  it("a star that lights while the first run reads storage still cheers", async () => {
    await AsyncStorage.setItem("jarso.goalStars.goal-1", "0");
    jest.spyOn(AsyncStorage, "getItem").mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return "0";
    });
    const { rerender } = await setup(view(0.1));
    await rerender({ v: view(0.55) });
    await waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
    expect(celebrate.mock.calls[0][0].title).toBe("Halfway there!");
  });

  it("storage that fails never throws and never cheers", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk"));
    await setup(view(0.6));
    await settle();
    expect(celebrate).not.toHaveBeenCalled();
  });
});

describe("useSavingPace", () => {
  function pace() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useSavingPace(), { wrapper });
  }

  it("useSavingPace is null for a stopped schedule", async () => {
    (findLatestSchedule as jest.Mock).mockResolvedValue({
      amountMinor: 500,
      frequency: "weekly",
      status: "stopped",
    });
    const { result } = await pace();
    await waitFor(() => expect(findLatestSchedule).toHaveBeenCalled());
    await settle();
    expect(result.current.frequency).toBeNull();
  });

  it("is null for a paused schedule", async () => {
    (findLatestSchedule as jest.Mock).mockResolvedValue({
      amountMinor: 500,
      frequency: "weekly",
      status: "paused",
    });
    const { result } = await pace();
    await waitFor(() => expect(findLatestSchedule).toHaveBeenCalled());
    await settle();
    expect(result.current.frequency).toBeNull();
  });

  it("is the frequency of an active schedule", async () => {
    (findLatestSchedule as jest.Mock).mockResolvedValue({
      amountMinor: 500,
      frequency: "monthly",
      status: "active",
    });
    const { result } = await pace();
    await waitFor(() => expect(result.current.frequency).toBe("monthly"));
  });
});

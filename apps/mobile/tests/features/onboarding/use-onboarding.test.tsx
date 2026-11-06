import { AppError } from "@jarso/core/lib";
import { completeOnboarding, findTour, saveTour } from "@jarso/data/tour";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useFinishOnboarding, useOnboardingGate, useSkipOnboarding } from "@/features/onboarding";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "u1" }),
}));
jest.mock("@jarso/data/tour", () => ({
  findTour: jest.fn(),
  saveTour: jest.fn(),
  completeOnboarding: jest.fn(),
}));

const FLAG = "jarso-onboarded:u1";

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (findTour as jest.Mock).mockResolvedValue({ buddy: null, finishedAt: null });
  (saveTour as jest.Mock).mockResolvedValue(undefined);
  (completeOnboarding as jest.Mock).mockResolvedValue({ sparks: 50, badge: "jar_starter" });
});

describe("useOnboardingGate", () => {
  it("shows the intro when the tour is not finished", async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(() => useOnboardingGate("u1"), { wrapper });
    await waitFor(() => expect(result.current).toBe("show"));
    expect(findTour).toHaveBeenCalledWith({ id: "client" }, "u1");
  });

  it("skips when the phone already knows it is done, without reading the tour", async () => {
    await AsyncStorage.setItem(FLAG, "1");
    const { wrapper } = setup();
    const { result } = await renderHook(() => useOnboardingGate("u1"), { wrapper });
    await waitFor(() => expect(result.current).toBe("skip"));
    expect(findTour).not.toHaveBeenCalled();
  });

  it("skips and remembers when the server says finished", async () => {
    (findTour as jest.Mock).mockResolvedValue({ buddy: "bo", finishedAt: "2026-11-06T10:00:00Z" });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useOnboardingGate("u1"), { wrapper });
    await waitFor(() => expect(result.current).toBe("skip"));
    await waitFor(async () => expect(await AsyncStorage.getItem(FLAG)).toBe("1"));
  });

  it("skips when the tour can't be read", async () => {
    (findTour as jest.Mock).mockRejectedValue(new AppError("INTERNAL", "offline"));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useOnboardingGate("u1"), { wrapper });
    await waitFor(() => expect(result.current).toBe("skip"));
    expect(await AsyncStorage.getItem(FLAG)).toBeNull();
  });

  it("skips without a user", async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(() => useOnboardingGate(undefined), { wrapper });
    expect(result.current).toBe("skip");
  });
});

describe("useFinishOnboarding", () => {
  it("finish returns what the server paid and remembers it", async () => {
    const { client, wrapper } = setup();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useFinishOnboarding(), { wrapper });
    let reward: unknown;
    await act(async () => {
      reward = await result.current.finish();
    });
    expect(reward).toEqual({ sparks: 50, badge: "jar_starter" });
    expect(completeOnboarding).toHaveBeenCalledWith({ id: "client" });
    expect(await AsyncStorage.getItem(FLAG)).toBe("1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.progress("u1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.tour("u1") });
  });

  it("finish falls back to save_welcome_tour when the new function fails", async () => {
    (completeOnboarding as jest.Mock).mockRejectedValue(new AppError("INTERNAL", "missing"));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useFinishOnboarding(), { wrapper });
    let reward: unknown;
    await act(async () => {
      reward = await result.current.finish();
    });
    expect(saveTour).toHaveBeenCalledWith({ id: "client" }, { finished: true });
    expect(reward).toEqual({ sparks: 0, badge: null });
    expect(await AsyncStorage.getItem(FLAG)).toBe("1");
  });

  it("finish never throws when both fail", async () => {
    (completeOnboarding as jest.Mock).mockRejectedValue(new Error("down"));
    (saveTour as jest.Mock).mockRejectedValue(new Error("down"));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useFinishOnboarding(), { wrapper });
    await act(async () => {
      await expect(result.current.finish()).resolves.toEqual({ sparks: 0, badge: null });
    });
  });

  it("finish twice at once calls the server once", async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(() => useFinishOnboarding(), { wrapper });
    await act(async () => {
      await Promise.all([result.current.finish(), result.current.finish()]);
    });
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });
});

describe("useSkipOnboarding", () => {
  it("skip saves finished and remembers it", async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSkipOnboarding(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(saveTour).toHaveBeenCalledWith({ id: "client" }, { finished: true });
    expect(await AsyncStorage.getItem(FLAG)).toBe("1");
  });

  it("skip never throws when saving fails", async () => {
    (saveTour as jest.Mock).mockRejectedValue(new Error("down"));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSkipOnboarding(), { wrapper });
    await act(async () => {
      await expect(result.current()).resolves.toBeUndefined();
    });
    expect(await AsyncStorage.getItem(FLAG)).toBe("1");
  });
});

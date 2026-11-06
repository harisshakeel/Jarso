import { getProgress } from "@jarso/data/progress";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useCheckinPrompt } from "@/features/checkin";
import { keys } from "@/lib/query";

const mockRouter = { push: jest.fn() };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, []),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "u1" }),
}));
jest.mock("@/features/jars", () => ({
  useHome: () => ({ data: { context: { timezone: "Asia/Kolkata" } } }),
}));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));

const KEY = "jarso-checkin-asked:u1";
const progress = (checkedInToday: boolean) => ({
  sparks: 1,
  level: 1,
  streak: 1,
  checkedInToday,
  look: { lid: "teal", wear: "none" },
});

async function setup(seed?: { checkedInToday: boolean; at: Date }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) {
    client.setQueryData(keys.progress("u1"), progress(seed.checkedInToday), {
      updatedAt: seed.at.getTime(),
    });
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return await renderHook(() => useCheckinPrompt(), { wrapper });
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: new Date("2026-11-06T10:00:00Z"),
    doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout"],
  });
  await AsyncStorage.clear();
  (getProgress as jest.Mock).mockResolvedValue(progress(false));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useCheckinPrompt", () => {
  it("opens the check-in once on the first open of the day", async () => {
    const { rerender } = await setup();
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/(child)/checkin"));
    await rerender({});
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(KEY)).toBe("2026-11-06");
  });

  it("does not open after checking in today", async () => {
    (getProgress as jest.Mock).mockResolvedValue(progress(true));
    await setup();
    await waitFor(() => expect(getProgress).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("does not open again the same family day", async () => {
    await AsyncStorage.setItem(KEY, "2026-11-06");
    await setup({ checkedInToday: false, at: new Date() });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("rereads stale progress after family midnight and then asks", async () => {
    await setup({ checkedInToday: true, at: new Date("2026-11-05T10:00:00Z") });
    await waitFor(() => expect(getProgress).toHaveBeenCalled());
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/(child)/checkin"));
  });

  it("stays quiet when progress fails", async () => {
    (getProgress as jest.Mock).mockRejectedValue(new Error("offline"));
    await setup();
    await waitFor(() => expect(getProgress).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("does not show stale progress when the reread fails", async () => {
    (getProgress as jest.Mock).mockRejectedValue(new Error("offline"));
    await setup({ checkedInToday: true, at: new Date("2026-11-05T10:00:00Z") });
    await waitFor(() => expect(getProgress).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("does not fetch progress when already asked today", async () => {
    await AsyncStorage.setItem(KEY, "2026-11-06");
    await setup();
    await new Promise((r) => setTimeout(r, 20));
    // only the hook's own mount read, no extra refetch from the prompt
    expect(getProgress).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("storage failure still asks only once this run", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValue(new Error("x"));
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValue(new Error("x"));
    const { rerender } = await setup();
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    await rerender({});
    await new Promise((r) => setTimeout(r, 20));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });
});

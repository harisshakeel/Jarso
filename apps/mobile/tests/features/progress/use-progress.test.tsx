import { AppError } from "@jarso/core/lib";
import { findParentLabels } from "@jarso/data/family";
import { dailyCheckin, getProgress, setJarsoLook } from "@jarso/data/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useDailyCheckin, useParentLabel, useProgress, useSetJarsoLook } from "@/features/progress";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "u1" }),
}));
jest.mock("@jarso/data/progress", () => ({
  getProgress: jest.fn(),
  dailyCheckin: jest.fn(),
  setJarsoLook: jest.fn(),
}));
jest.mock("@jarso/data/family", () => ({ findParentLabels: jest.fn() }));

const progress = { sparks: 10, level: 1, look: { lid: "teal", wear: "none" } };
const NEW_LOOK = { lid: "gold", wear: "cap" } as never;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getProgress as jest.Mock).mockResolvedValue(progress);
});

describe("progress hooks", () => {
  it("reads progress under keys.progress", async () => {
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useProgress(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(progress));
    expect(keys.progress("u1")).toEqual(["progress", "u1"]);
    expect(client.getQueryData(["progress", "u1"])).toEqual(progress);
    expect(getProgress).toHaveBeenCalledWith({ id: "client" }, "u1");
  });

  it("check-in invalidates progress", async () => {
    (dailyCheckin as jest.Mock).mockResolvedValue({ status: "recorded", sparks: 2 });
    const { client, wrapper } = setup();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useDailyCheckin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("yes");
    });
    expect(dailyCheckin).toHaveBeenCalledWith({ id: "client" }, "yes");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.progress("u1") });
  });

  it("look is set optimistically", async () => {
    let release: () => void = () => undefined;
    (setJarsoLook as jest.Mock).mockReturnValue(new Promise<void>((r) => (release = r)));
    const { client, wrapper } = setup();
    client.setQueryData(keys.progress("u1"), progress);
    const { result } = await renderHook(() => useSetJarsoLook(), { wrapper });
    await act(async () => {
      result.current.mutate(NEW_LOOK);
    });
    await waitFor(() =>
      expect((client.getQueryData(keys.progress("u1")) as typeof progress).look).toEqual(NEW_LOOK),
    );
    await act(async () => release());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("look change with an empty cache does not throw and invalidates on settle", async () => {
    (setJarsoLook as jest.Mock).mockResolvedValue(undefined);
    const { client, wrapper } = setup();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useSetJarsoLook(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(NEW_LOOK);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(keys.progress("u1"))).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.progress("u1") });
  });

  it("look rolls back when it rejects", async () => {
    (setJarsoLook as jest.Mock).mockRejectedValue(new AppError("VALIDATION", "Not unlocked yet"));
    const { client, wrapper } = setup();
    client.setQueryData(keys.progress("u1"), progress);
    const { result } = await renderHook(() => useSetJarsoLook(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(NEW_LOOK).catch(() => undefined);
    });
    expect(client.getQueryData(keys.progress("u1"))).toEqual(progress);
  });

  it("parent label uses the first label", async () => {
    (findParentLabels as jest.Mock).mockResolvedValue(["Mum", "Dad"]);
    const { wrapper } = setup();
    const { result } = await renderHook(() => useParentLabel(), { wrapper });
    await waitFor(() => expect(result.current).toBe("Mum"));
  });

  it("parent label falls back to 'your parent'", async () => {
    (findParentLabels as jest.Mock).mockResolvedValue([]);
    const { wrapper } = setup();
    const { result } = await renderHook(() => useParentLabel(), { wrapper });
    expect(result.current).toBe("your parent");
    await waitFor(() => expect(findParentLabels).toHaveBeenCalled());
    expect(result.current).toBe("your parent");
  });
});

import { fetchDevicePushPrefs, saveDevicePushPrefs } from "@jarso/data/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { AppState, type AppStateStatus } from "react-native";
import { useDevicePushPrefs } from "@/features/push";

const TOKEN = "ExponentPushToken[abc]";

jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "project-1" } } } },
}));
jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: "android", data: "fcm-1" })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: "expo", data: "ExponentPushToken[abc]" })),
}));
jest.mock("@jarso/data/notifications", () => ({
  ...jest.requireActual("@jarso/data/notifications"),
  fetchDevicePushPrefs: jest.fn(),
  saveDevicePushPrefs: jest.fn(),
}));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn(async () => ({ id: "row-1" })) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", userId: "user-1" }),
}));

const fetchPrefs = fetchDevicePushPrefs as jest.Mock;
const savePrefs = saveDevicePushPrefs as jest.Mock;
const permissions = Notifications.getPermissionsAsync as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem("jarso-push-token:user-1", TOKEN);
  permissions.mockResolvedValue({ granted: true, status: "granted" });
  fetchPrefs.mockResolvedValue({ mutedGroups: [], paused: false });
  savePrefs.mockResolvedValue(true);
});

/** Captures the hook's AppState listener for its next mount. */
function listenToAppState() {
  let listener: (state: AppStateStatus) => void = () => undefined;
  jest.spyOn(AppState, "addEventListener").mockImplementationOnce((_type, cb) => {
    listener = cb as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return (state: AppStateStatus) => listener(state);
}

async function ready() {
  const hook = await renderHook(() => useDevicePushPrefs());
  await waitFor(() => expect(hook.result.current.status).not.toBe("loading"));
  return hook;
}

describe("useDevicePushPrefs", () => {
  it("reads this phone's row by its registered token", async () => {
    const { result } = await ready();
    expect(result.current.status).toBe("ready");
    expect(result.current.prefs).toEqual({ mutedGroups: [], paused: false });
    expect(fetchPrefs).toHaveBeenCalledWith({}, TOKEN);
  });

  it("saves optimistically through set_device_push_prefs", async () => {
    const { result } = await ready();
    await act(() => result.current.save({ mutedGroups: ["money"], paused: false }));
    expect(savePrefs).toHaveBeenCalledWith(
      {},
      { token: TOKEN, mutedGroups: ["money"], paused: false },
    );
    expect(result.current.prefs).toEqual({ mutedGroups: ["money"], paused: false });
  });

  it("a failed save rolls back and rethrows", async () => {
    savePrefs.mockRejectedValueOnce(new Error("down"));
    const { result } = await ready();
    await act(async () => {
      await expect(result.current.save({ mutedGroups: [], paused: true })).rejects.toThrow();
    });
    expect(result.current.prefs).toEqual({ mutedGroups: [], paused: false });
  });

  it("a save the server refuses (not this account's row) rolls back too", async () => {
    savePrefs.mockResolvedValueOnce(false);
    const { result } = await ready();
    await act(async () => {
      await expect(result.current.save({ mutedGroups: [], paused: true })).rejects.toThrow();
    });
    expect(result.current.prefs).toEqual({ mutedGroups: [], paused: false });
  });

  it("a failed save doesn't undo a newer change made while it was saving", async () => {
    let fail: (error: Error) => void = () => undefined;
    savePrefs.mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)));
    const { result } = await ready();
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.save({ mutedGroups: ["money"], paused: false });
    });
    await act(async () => {
      second = result.current.save({ mutedGroups: ["money"], paused: true });
    });
    await act(async () => {
      fail(new Error("down"));
      await Promise.all([first, second]);
    });
    expect(result.current.prefs).toEqual({ mutedGroups: ["money"], paused: true });
    expect(savePrefs).toHaveBeenLastCalledWith(
      {},
      { token: TOKEN, mutedGroups: ["money"], paused: true },
    );
  });

  it("saves one at a time, then sends only the latest change", async () => {
    let finish: (value: boolean) => void = () => undefined;
    savePrefs.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { result } = await ready();
    const saves: Promise<void>[] = [];
    await act(async () => {
      saves.push(result.current.save({ mutedGroups: ["money"], paused: false }));
    });
    await act(async () => {
      saves.push(result.current.save({ mutedGroups: ["money"], paused: true }));
    });
    await act(async () => {
      saves.push(result.current.save({ mutedGroups: [], paused: true }));
    });
    expect(savePrefs).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(true);
      await Promise.all(saves);
    });
    expect(savePrefs.mock.calls.map(([, record]) => record)).toEqual([
      { token: TOKEN, mutedGroups: ["money"], paused: false },
      { token: TOKEN, mutedGroups: [], paused: true },
    ]);
    expect(result.current.prefs).toEqual({ mutedGroups: [], paused: true });
  });

  it("when every queued save fails it rolls back to what the server last confirmed", async () => {
    const fails: ((error: Error) => void)[] = [];
    savePrefs.mockImplementation(() => new Promise((_resolve, reject) => fails.push(reject)));
    const { result } = await ready();
    const saves: Promise<void>[] = [];
    await act(async () => {
      saves.push(result.current.save({ mutedGroups: ["money"], paused: false }));
    });
    await act(async () => {
      saves.push(result.current.save({ mutedGroups: ["money"], paused: true }));
    });
    await act(async () => fails[0]?.(new Error("down")));
    await waitFor(() => expect(fails).toHaveLength(2));
    await act(async () => {
      fails[1]?.(new Error("down"));
      await Promise.allSettled(saves);
    });
    expect(result.current.prefs).toEqual({ mutedGroups: [], paused: false });
    await expect(saves[1]).rejects.toThrow();
  });

  it("an older load that finishes last doesn't replace a newer one", async () => {
    const onChange = listenToAppState();
    let finishFirst: (value: unknown) => void = () => undefined;
    fetchPrefs
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce({ mutedGroups: ["money"], paused: true });
    const { result } = await renderHook(() => useDevicePushPrefs());
    await waitFor(() => expect(fetchPrefs).toHaveBeenCalledTimes(1));
    await act(async () => onChange("active"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => finishFirst({ mutedGroups: [], paused: false }));
    expect(result.current.prefs).toEqual({ mutedGroups: ["money"], paused: true });
  });

  it("an older load that fails last doesn't replace a newer one", async () => {
    const onChange = listenToAppState();
    let failFirst: (error: Error) => void = () => undefined;
    fetchPrefs.mockReturnValueOnce(new Promise((_resolve, reject) => (failFirst = reject)));
    const { result } = await renderHook(() => useDevicePushPrefs());
    await waitFor(() => expect(fetchPrefs).toHaveBeenCalledTimes(1));
    await act(async () => onChange("active"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => failFirst(new Error("down")));
    expect(result.current.status).toBe("ready");
  });

  it("notifications off for Jarso → denied", async () => {
    permissions.mockResolvedValue({ granted: false, status: "denied", canAskAgain: false });
    const { result } = await ready();
    expect(result.current.status).toBe("denied");
    expect(fetchPrefs).not.toHaveBeenCalled();
  });

  it("no stored token, or no row for it → no-token", async () => {
    await AsyncStorage.clear();
    expect((await ready()).result.current.status).toBe("no-token");
    await AsyncStorage.setItem("jarso-push-token:user-1", TOKEN);
    fetchPrefs.mockResolvedValueOnce(null);
    expect((await ready()).result.current.status).toBe("no-token");
  });

  it("turnOn registers the phone, then reads its settings", async () => {
    await AsyncStorage.clear();
    const { result } = await ready();
    await act(() => result.current.turnOn());
    expect(result.current.status).toBe("ready");
    await expect(AsyncStorage.getItem("jarso-push-token:user-1")).resolves.toBe(TOKEN);
  });
});

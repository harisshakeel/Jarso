import { fetchDevicePushPrefs, saveDevicePushPrefs } from "@jarso/data/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
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
    await act(async () => {
      first = result.current.save({ mutedGroups: ["money"], paused: false });
    });
    await act(() => result.current.save({ mutedGroups: ["money"], paused: true }));
    await act(async () => {
      fail(new Error("down"));
      await first.catch(() => undefined);
    });
    expect(result.current.prefs).toEqual({ mutedGroups: ["money"], paused: true });
  });

  it("notifications off for Jarso → denied", async () => {
    permissions.mockResolvedValue({ granted: false, status: "denied" });
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

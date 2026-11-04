import { pushPromptCopy } from "@jarso/core/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook, waitFor } from "@testing-library/react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Alert } from "react-native";
import { runBeforeSignOut } from "@/features/auth";
import {
  askForPush,
  getRegisteredToken,
  registerForPush,
  unregisterFromPush,
  usePushRegistration,
} from "@/features/push";
import { logger } from "@/lib";
import { apiFetch } from "@/lib/api";

const TOKEN = "ExponentPushToken[abc]";
const ROTATED = "ExponentPushToken[def]";

const mockOrder: string[] = [];
let mockTokenListener: ((token: unknown) => void) | undefined;
const mockRemoveTokenListener = jest.fn();

jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "project-1" } } } },
}));
jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(async () => {
    mockOrder.push("channel");
    return null;
  }),
  getPermissionsAsync: jest.fn(async () => {
    mockOrder.push("permissions");
    return { granted: true, status: "granted" };
  }),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: "expo", data: "ExponentPushToken[abc]" })),
  unregisterForNotificationsAsync: jest.fn(async () => undefined),
  addPushTokenListener: jest.fn((listener: (token: unknown) => void) => {
    mockTokenListener = listener;
    return { remove: mockRemoveTokenListener };
  }),
}));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const mockSession = { status: "parent", userId: "user-1" } as {
  status: string;
  userId?: string;
};
jest.mock("@/features/auth/use-session", () => ({ useSession: () => mockSession }));

const api = apiFetch as jest.Mock;
const getPermissions = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissions = Notifications.requestPermissionsAsync as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  mockOrder.length = 0;
  mockTokenListener = undefined;
  await AsyncStorage.clear();
  api.mockReset().mockResolvedValue({ id: "row-1" });
  getPermissions.mockImplementation(async () => {
    mockOrder.push("permissions");
    return { granted: true, status: "granted" };
  });
  requestPermissions.mockReset().mockResolvedValue({ granted: true, status: "granted" });
  (Device as { isDevice: boolean }).isDevice = true;
  mockSession.status = "parent";
  mockSession.userId = "user-1";
});

const ask = jest.fn(async () => true);

describe("registerForPush", () => {
  it("creates the notices channel before asking permission", async () => {
    await registerForPush({ userId: "user-1", role: "parent", ask });
    expect(mockOrder.slice(0, 2)).toEqual(["channel", "permissions"]);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith("notices", {
      name: "Notices",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  });

  it("already granted → posts the token without asking", async () => {
    await expect(registerForPush({ userId: "user-1", role: "parent", ask })).resolves.toBe(TOKEN);
    expect(ask).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(api).toHaveBeenCalledWith("/api/v1/push/tokens", {
      method: "POST",
      auth: true,
      body: { token: TOKEN, platform: "android" },
    });
    await expect(getRegisteredToken("user-1")).resolves.toBe(TOKEN);
  });

  it("undetermined → asks with the role's copy, then the system prompt; denied → no POST and the ask is remembered", async () => {
    getPermissions.mockResolvedValue({ granted: false, status: "undetermined" });
    requestPermissions.mockResolvedValueOnce({ granted: false, status: "denied" });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.[1]?.onPress?.();
    });

    await expect(
      registerForPush({ userId: "user-1", role: "child", ask: askForPush }),
    ).resolves.toBeNull();

    expect(alert).toHaveBeenCalledWith(
      pushPromptCopy.title,
      pushPromptCopy.child,
      expect.any(Array),
      expect.anything(),
    );
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalled();
    await expect(AsyncStorage.getItem("jarso-push-asked:user-1")).resolves.toBe("1");
    alert.mockRestore();
  });

  it("'Not now' never shows the system prompt", async () => {
    getPermissions.mockResolvedValue({ granted: false, status: "undetermined" });
    const no = jest.fn(async () => false);
    await expect(
      registerForPush({ userId: "user-1", role: "parent", ask: no }),
    ).resolves.toBeNull();
    expect(no).toHaveBeenCalledWith("parent");
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("asked before for this user → no prompt, no POST", async () => {
    getPermissions.mockResolvedValue({ granted: false, status: "undetermined" });
    await AsyncStorage.setItem("jarso-push-asked:user-1", "1");
    await expect(registerForPush({ userId: "user-1", role: "parent", ask })).resolves.toBeNull();
    expect(ask).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("another user on the same phone is asked once", async () => {
    getPermissions.mockResolvedValue({ granted: false, status: "undetermined" });
    requestPermissions.mockResolvedValue({ granted: false, status: "undetermined" });
    await AsyncStorage.setItem("jarso-push-asked:user-1", "1");
    await registerForPush({ userId: "user-2", role: "child", ask });
    await registerForPush({ userId: "user-2", role: "child", ask });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("not a device → nothing", async () => {
    (Device as { isDevice: boolean }).isDevice = false;
    await expect(registerForPush({ userId: "user-1", role: "parent", ask })).resolves.toBeNull();
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("a failed POST is logged by code and never thrown", async () => {
    api.mockRejectedValueOnce(Object.assign(new Error(`bad ${TOKEN}`), { code: "FORBIDDEN" }));
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    await expect(registerForPush({ userId: "user-1", role: "parent", ask })).resolves.toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
    warn.mockRestore();
  });
});

describe("unregisterFromPush", () => {
  it("unregister sends DELETE with the token", async () => {
    await unregisterFromPush(TOKEN);
    expect(api).toHaveBeenCalledWith("/api/v1/push/tokens", {
      method: "DELETE",
      auth: true,
      body: { token: TOKEN },
    });
    expect(Notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();
  });

  it("unregister falls back to unregisterForNotificationsAsync when DELETE fails", async () => {
    api.mockRejectedValueOnce(new Error("offline"));
    await unregisterFromPush(TOKEN);
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it("unregister never throws", async () => {
    api.mockRejectedValueOnce(new Error("offline"));
    (Notifications.unregisterForNotificationsAsync as jest.Mock).mockRejectedValueOnce(
      new Error("native"),
    );
    await expect(unregisterFromPush(TOKEN)).resolves.toBeUndefined();
  });
});

describe("usePushRegistration", () => {
  it("a rotated token is posted again", async () => {
    await renderHook(() => usePushRegistration());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValueOnce({
      type: "expo",
      data: ROTATED,
    });
    mockTokenListener?.({ type: "android", data: "fcm-2" });
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith("/api/v1/push/tokens", {
        method: "POST",
        auth: true,
        body: { token: ROTATED, platform: "android" },
      }),
    );
  });

  it("the sign-out hook is registered once per signed-in user and disposed on unmount", async () => {
    const { rerender, unmount } = await renderHook(() => usePushRegistration());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await rerender({});
    await rerender({});
    expect(api).toHaveBeenCalledTimes(1);

    api.mockClear();
    await runBeforeSignOut();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/api/v1/push/tokens", {
      method: "DELETE",
      auth: true,
      body: { token: TOKEN },
    });

    await unmount();
    api.mockClear();
    await runBeforeSignOut();
    expect(api).not.toHaveBeenCalled();
    expect(mockRemoveTokenListener).toHaveBeenCalled();
  });

  it("does nothing while signed out", async () => {
    mockSession.status = "signed-out";
    mockSession.userId = undefined;
    await renderHook(() => usePushRegistration());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });
});

import { pushOffCardCopy, pushPromptCopy } from "@jarso/core/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Alert, type AlertButton, AppState, type AppStateStatus, Linking } from "react-native";
import { PushPermissionCard } from "@/features/push";
import { apiFetch } from "@/lib/api";

jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "project-1" } } } },
}));
jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: "expo", data: "ExponentPushToken[abc]" })),
}));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn(async () => ({ id: "row-1" })) }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", userId: "user-1" }),
}));

const permissions = Notifications.getPermissionsAsync as jest.Mock;
const request = Notifications.requestPermissionsAsync as jest.Mock;

/** Answers our own line before Android's prompt with "Turn on". */
function acceptOurLine() {
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === pushPromptCopy.allow)?.onPress?.();
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("PushPermissionCard", () => {
  it("stays hidden once notifications are on", async () => {
    permissions.mockResolvedValue({ granted: true, status: "granted", canAskAgain: true });
    await render(<PushPermissionCard />);
    await waitFor(() => expect(permissions).toHaveBeenCalled());
    expect(screen.queryByText(pushOffCardCopy.title)).toBeNull();
  });

  it("asks again after an earlier 'Don't allow' and registers the phone", async () => {
    // Asked once before: the automatic prompt won't come back, the card's button does.
    await AsyncStorage.setItem("jarso-push-asked:user-1", "1");
    permissions.mockResolvedValue({ granted: false, status: "denied", canAskAgain: true });
    request.mockImplementation(async () => {
      permissions.mockResolvedValue({ granted: true, status: "granted", canAskAgain: true });
      return { granted: true, status: "granted" };
    });
    acceptOurLine();
    await render(<PushPermissionCard />);
    expect(await screen.findByText(pushOffCardCopy.parent)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: pushOffCardCopy.turnOn }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/v1/push/tokens",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(screen.queryByText(pushOffCardCopy.title)).toBeNull());
  });

  it("sends the parent to the phone's settings once Android won't ask again", async () => {
    permissions.mockResolvedValue({ granted: false, status: "denied", canAskAgain: false });
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await render(<PushPermissionCard />);
    expect(await screen.findByText(pushOffCardCopy.blocked)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: pushOffCardCopy.openSettings }));
    expect(openSettings).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("'Not now' hides it on this phone", async () => {
    permissions.mockResolvedValue({ granted: false, status: "undetermined", canAskAgain: true });
    const first = await render(<PushPermissionCard />);
    fireEvent.press(await screen.findByRole("button", { name: pushOffCardCopy.later }));
    await waitFor(() => expect(screen.queryByText(pushOffCardCopy.title)).toBeNull());
    await first.unmount();
    await render(<PushPermissionCard />);
    await waitFor(() => expect(permissions).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(pushOffCardCopy.title)).toBeNull();
  });

  it("'Not now' wins over a check still in flight", async () => {
    let onAppState: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      onAppState = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    permissions.mockResolvedValueOnce({
      granted: false,
      status: "undetermined",
      canAskAgain: true,
    });
    await render(<PushPermissionCard />);
    const later = await screen.findByRole("button", { name: pushOffCardCopy.later });
    // The app comes back to the front: a fresh check starts and hasn't answered yet.
    let answer: (value: unknown) => void = () => undefined;
    permissions.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await act(async () => onAppState?.("active"));
    await waitFor(() => expect(permissions).toHaveBeenCalledTimes(2));
    fireEvent.press(later);
    await waitFor(() => expect(screen.queryByText(pushOffCardCopy.title)).toBeNull());
    await act(async () => {
      answer({ granted: false, status: "undetermined", canAskAgain: true });
    });
    expect(screen.queryByText(pushOffCardCopy.title)).toBeNull();
  });
});

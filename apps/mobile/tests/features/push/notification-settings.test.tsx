import { noticeGroupCopy } from "@jarso/core/notifications";
import { fetchDevicePushPrefs, saveDevicePushPrefs } from "@jarso/data/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import { NotificationSettings } from "@/features/push";

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

const mockSession: { status: string; userId: string } = { status: "parent", userId: "user-1" };
jest.mock("@/features/auth/use-session", () => ({ useSession: () => mockSession }));

const fetchPrefs = fetchDevicePushPrefs as jest.Mock;
const savePrefs = saveDevicePushPrefs as jest.Mock;
const permissions = Notifications.getPermissionsAsync as jest.Mock;
const { groups, pause } = noticeGroupCopy;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem("jarso-push-token:user-1", TOKEN);
  mockSession.status = "parent";
  permissions.mockResolvedValue({ granted: true, status: "granted" });
  fetchPrefs.mockResolvedValue({ mutedGroups: [], paused: false });
  savePrefs.mockResolvedValue(true);
});

const switchFor = (label: string) => screen.getByRole("switch", { name: label });

describe("NotificationSettings", () => {
  it("shows four groups and pause, all on by default", async () => {
    await render(<NotificationSettings />);
    await screen.findByRole("switch", { name: pause.label });
    expect(switchFor(pause.label).props.value).toBe(false);
    for (const group of Object.values(groups)) {
      expect(switchFor(group.label).props.value).toBe(true);
    }
    expect(screen.getByText(noticeGroupCopy.inboxStillShows)).toBeOnTheScreen();
    expect(screen.getByText(noticeGroupCopy.thisPhoneOnly)).toBeOnTheScreen();
    expect(screen.getByText(groups.money.hint)).toBeOnTheScreen();
    expect(fetchPrefs).toHaveBeenCalledWith({}, TOKEN);
  });

  it("turning money off saves mutedGroups ['money']", async () => {
    await render(<NotificationSettings />);
    const money = await screen.findByRole("switch", { name: groups.money.label });
    await act(async () => fireEvent(money, "valueChange", false));
    expect(savePrefs).toHaveBeenCalledWith(
      {},
      { token: TOKEN, mutedGroups: ["money"], paused: false },
    );
    expect(switchFor(groups.money.label).props.value).toBe(false);
  });

  it("pause disables the group switches", async () => {
    await render(<NotificationSettings />);
    const paused = await screen.findByRole("switch", { name: pause.label });
    await act(async () => fireEvent(paused, "valueChange", true));
    expect(savePrefs).toHaveBeenCalledWith({}, { token: TOKEN, mutedGroups: [], paused: true });
    for (const group of Object.values(groups)) {
      expect(switchFor(group.label)).toBeDisabled();
    }
  });

  it("a failed save puts the switch back and shows an error", async () => {
    savePrefs.mockRejectedValueOnce(new Error("down"));
    await render(<NotificationSettings />);
    const notes = await screen.findByRole("switch", { name: groups.notes.label });
    await act(async () => fireEvent(notes, "valueChange", false));
    await waitFor(() => expect(switchFor(groups.notes.label).props.value).toBe(true));
    expect(screen.getByRole("alert")).toBeOnTheScreen();
  });

  it("a save the server refuses (not this account's phone) also puts the switch back", async () => {
    savePrefs.mockResolvedValueOnce(false);
    await render(<NotificationSettings />);
    const notes = await screen.findByRole("switch", { name: groups.notes.label });
    await act(async () => fireEvent(notes, "valueChange", false));
    await waitFor(() => expect(switchFor(groups.notes.label).props.value).toBe(true));
    expect(screen.getByRole("alert")).toBeOnTheScreen();
  });

  it("denied permission shows Open phone settings", async () => {
    permissions.mockResolvedValue({ granted: false, status: "denied", canAskAgain: false });
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await render(<NotificationSettings />);
    expect(await screen.findByText(noticeGroupCopy.permissionOff.title)).toBeOnTheScreen();
    expect(screen.queryByRole("switch", { name: pause.label })).toBeNull();
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: noticeGroupCopy.permissionOff.action })),
    );
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("child sees the quiet hours note, parent does not", async () => {
    await render(<NotificationSettings />);
    await screen.findByRole("switch", { name: pause.label });
    expect(screen.queryByText(noticeGroupCopy.quietHours.label)).toBeNull();

    mockSession.status = "child";
    await render(<NotificationSettings />);
    expect(await screen.findByText(noticeGroupCopy.quietHours.label)).toBeOnTheScreen();
    expect(screen.queryByRole("switch", { name: noticeGroupCopy.quietHours.label })).toBeNull();
    expect(screen.getByText(noticeGroupCopy.newsStillShows)).toBeOnTheScreen();
    expect(screen.queryByText(noticeGroupCopy.inboxStillShows)).toBeNull();
  });

  it("no token shows Turn on, which registers the phone", async () => {
    await AsyncStorage.clear();
    await render(<NotificationSettings />);
    const turnOn = await screen.findByRole("button", { name: noticeGroupCopy.notOn.action });
    expect(screen.getByText(noticeGroupCopy.notOn.title)).toBeOnTheScreen();
    await act(async () => fireEvent.press(turnOn));
    expect(await screen.findByRole("switch", { name: pause.label })).toBeOnTheScreen();
  });
});

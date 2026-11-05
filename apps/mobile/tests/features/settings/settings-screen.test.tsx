import { guideCopy } from "@jarso/core/guide";
import { noticeGroupCopy } from "@jarso/core/notifications";
import { offlineCopy } from "@jarso/core/offline";
import { profileCopy } from "@jarso/core/profiles";
import { findNickname } from "@jarso/data/family";
import { listMemories } from "@jarso/data/guide";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";
import type { ReactElement } from "react";
import { Appearance } from "react-native";
import { loadTheme, MemoriesScreen, SettingsScreen, THEME_KEY } from "@/features/settings";
import { apiFetch } from "@/lib/api";
import { useOutboxItems } from "@/lib/outbox";

const mockSignOut = jest.fn();
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1", signOut: mockSignOut }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@jarso/data/family", () => ({ findNickname: jest.fn() }));
jest.mock("@/lib/outbox", () => ({ useOutboxItems: jest.fn(() => []) }));
jest.mock("@/lib/api", () => ({
  apiFetch: jest.fn().mockResolvedValue({ available: false, introNeeded: false }),
}));
jest.mock("@jarso/data/guide", () => ({
  listMemories: jest.fn().mockResolvedValue([]),
  deleteMemory: jest.fn(),
}));

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

function renderSettings(ui: ReactElement = <SettingsScreen />) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const note = (id: string, text: string) => ({
  id,
  kind: "interest" as const,
  text,
  createdAt: "2026-11-01T00:00:00Z",
  expiresAt: "2027-11-01T00:00:00Z",
});

beforeEach(() => {
  (apiFetch as jest.Mock).mockResolvedValue({ available: false, introNeeded: false });
  (listMemories as jest.Mock).mockResolvedValue([]);
  (findNickname as jest.Mock).mockReset().mockResolvedValue(null);
  mockStore.clear();
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
});

describe("SettingsScreen", () => {
  beforeEach(async () => {
    await act(() => colorScheme.set("light"));
  });

  it("has one Dark mode switch, off in light mode, and no Looks choices", async () => {
    await renderSettings();
    expect(
      await screen.findByRole("switch", { name: profileCopy.darkMode, checked: false }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("radio")).not.toBeOnTheScreen();
    expect(screen.queryByText("Same as my phone")).not.toBeOnTheScreen();
  });

  it("is on while the app is dark", async () => {
    await act(() => colorScheme.set("dark"));
    await renderSettings();
    expect(
      await screen.findByRole("switch", { name: profileCopy.darkMode, checked: true }),
    ).toBeOnTheScreen();
  });

  it("turns dark mode on, applies it and stores it under 'theme'", async () => {
    const set = jest.spyOn(colorScheme, "set");
    await renderSettings();
    await userEvent
      .setup()
      .press(await screen.findByRole("switch", { name: profileCopy.darkMode }));

    expect(set).toHaveBeenCalledWith("dark");
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith("theme", "dark"));
    expect(
      screen.getByRole("switch", { name: profileCopy.darkMode, checked: true }),
    ).toBeOnTheScreen();
  });

  it("explains how to sign back in and signs out", async () => {
    await renderSettings();
    expect(
      screen.getByText("You can sign back in with your family code, nickname and PIN."),
    ).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByLabelText("Sign out")));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsScreen menu", () => {
  it("opens the child's Notifications page", async () => {
    await renderSettings();
    await userEvent.setup().press(screen.getByRole("button", { name: noticeGroupCopy.title }));
    expect(mockPush).toHaveBeenCalledWith("/(child)/notifications");
  });

  it("hides What Jarso remembers while Jarso is off and nothing is kept", async () => {
    await renderSettings();
    await waitFor(() => expect(listMemories).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: guideCopy.memories.title })).toBeNull();
  });

  it("shows how many notes Jarso keeps, even with Jarso off, and opens them", async () => {
    (listMemories as jest.Mock).mockResolvedValue([note("m1", "Football"), note("m2", "Bikes")]);
    await renderSettings();
    const row = await screen.findByRole("button", { name: guideCopy.memories.title });
    expect(screen.getByText("2 notes")).toBeOnTheScreen();
    await userEvent.setup().press(row);
    expect(mockPush).toHaveBeenCalledWith("/(child)/memories");
  });

  it("shows the row with no notes yet while Jarso is on", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ available: true, introNeeded: false });
    await renderSettings();
    expect(await screen.findByText("0 notes")).toBeOnTheScreen();
  });

  it("shows the child's initial and nickname in the header card", async () => {
    (findNickname as jest.Mock).mockResolvedValue("maya");
    await renderSettings();
    expect(await screen.findByRole("header", { name: "maya" })).toBeOnTheScreen();
    expect(screen.getByText("M", { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe("MemoriesScreen", () => {
  it("lists each note with Forget", async () => {
    (listMemories as jest.Mock).mockResolvedValue([note("m1", "Football")]);
    await renderSettings(<MemoriesScreen />);
    expect(await screen.findByText(/Football/)).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: `${guideCopy.memories.forget}: Football` }),
    ).toBeOnTheScreen();
  });

  it("leaves the title to the page header", async () => {
    (listMemories as jest.Mock).mockResolvedValue([note("m1", "Football")]);
    await renderSettings(<MemoriesScreen />);
    await screen.findByText(/Football/);
    expect(screen.queryByRole("header", { name: guideCopy.memories.title })).toBeNull();
  });
});

describe("SettingsScreen sign-out with purchases still on the phone", () => {
  it("warns first, then signs out on the second tap", async () => {
    (useOutboxItems as jest.Mock).mockReturnValue([{ id: "a" }]);
    await renderSettings();
    await act(async () => fireEvent.press(screen.getByLabelText("Sign out")));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.getByText(offlineCopy.signOutWaiting)).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByLabelText(offlineCopy.signOutAnyway)));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    (useOutboxItems as jest.Mock).mockReturnValue([]);
  });
});

describe("SettingsScreen nickname", () => {
  it("says which nickname the child signs in as", async () => {
    (findNickname as jest.Mock).mockResolvedValue("Maya");
    await renderSettings();
    expect(
      await screen.findByText("You sign in as Maya. A parent can change your nickname or PIN."),
    ).toBeOnTheScreen();
  });

  it.each([
    ["no nickname", () => (findNickname as jest.Mock).mockResolvedValue(null)],
    ["a failed read", () => (findNickname as jest.Mock).mockRejectedValue(new Error("down"))],
  ])("uses the fallback line for %s", async (_name, arrange) => {
    arrange();
    await renderSettings();
    expect(
      await screen.findByText(
        "Your nickname is how you sign in. A parent can change your nickname or PIN.",
      ),
    ).toBeOnTheScreen();
  });
});

describe("loadTheme", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([["light"], ["dark"]])("reads a stored %s", async (value) => {
    mockStore.set(THEME_KEY, value);
    expect(await loadTheme()).toBe(value);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", undefined, "dark"],
    ["an old 'system'", "system", "dark"],
    ["something unknown", "purple", "light"],
  ] as const)(
    "with %s stored, uses the phone's scheme and saves it at once",
    async (_name, stored, phone) => {
      if (stored) mockStore.set(THEME_KEY, stored);
      jest.spyOn(Appearance, "getColorScheme").mockReturnValue(phone);
      expect(await loadTheme()).toBe(phone);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(THEME_KEY, phone);
    },
  );

  it("with no phone scheme, starts light", async () => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue(null);
    expect(await loadTheme()).toBe("light");
    expect(mockStore.get(THEME_KEY)).toBe("light");
  });

  it("uses the phone's scheme without saving when the store can't be read", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error("locked"));
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    expect(await loadTheme()).toBe("dark");
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

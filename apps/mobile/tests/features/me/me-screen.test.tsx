import { guideCopy } from "@jarso/core/guide";
import { lookCopy } from "@jarso/core/mascot";
import { noticeGroupCopy } from "@jarso/core/notifications";
import { offlineCopy } from "@jarso/core/offline";
import { profileCopy } from "@jarso/core/profiles";
import { BADGE_KEYS, meCopy } from "@jarso/core/progress";
import { findNickname } from "@jarso/data/family";
import { listMemories } from "@jarso/data/guide";
import { getProgress, setJarsoLook } from "@jarso/data/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";
import type { ReactElement } from "react";
import { MemoriesScreen, MeScreen } from "@/features/me";
import { apiFetch } from "@/lib/api";
import { useOutboxItems } from "@/lib/outbox";
import { useSoundOn } from "@/lib/sound";

const mockSignOut = jest.fn();
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1", signOut: mockSignOut }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@jarso/data/family", () => ({
  findNickname: jest.fn(),
  findParentLabels: jest.fn().mockResolvedValue([]),
}));
jest.mock("@jarso/data/progress", () => ({
  getProgress: jest.fn(),
  setJarsoLook: jest.fn(),
  dailyCheckin: jest.fn(),
}));
jest.mock("@/lib/outbox", () => ({ useOutboxItems: jest.fn(() => []) }));
jest.mock("@/lib/api", () => ({
  apiFetch: jest.fn().mockResolvedValue({ available: false, introNeeded: false }),
}));
jest.mock("@jarso/data/guide", () => ({
  listMemories: jest.fn().mockResolvedValue([]),
  deleteMemory: jest.fn(),
}));
const mockSetSound = jest.fn();
jest.mock("@/lib/sound", () => ({
  useSoundOn: jest.fn(() => [true, mockSetSound]),
  playSound: jest.fn(),
  getSoundOn: jest.fn(async () => true),
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

const progress = (over: Record<string, unknown> = {}) => ({
  sparks: 640,
  level: 4,
  nextLevelAt: 700,
  streak: 3,
  bestStreak: 5,
  restUsedThisWeek: false,
  checkedInToday: true,
  look: { lid: "cyan", wear: "none" },
  badges: [{ key: "first_save", earnedAt: "2026-11-01T10:00:00Z" }],
  recent: [],
  ...over,
});

function renderMe(ui: ReactElement = <MeScreen />) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
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
  (getProgress as jest.Mock).mockReset().mockResolvedValue(progress());
  (setJarsoLook as jest.Mock).mockReset().mockResolvedValue(undefined);
  mockStore.clear();
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
});

describe("MeScreen trophy room", () => {
  it("shows the level name and Sparks to the next level", async () => {
    await renderMe();
    expect(await screen.findByText(meCopy.level(4, "Coin Keeper"))).toBeOnTheScreen();
    expect(screen.getByText(meCopy.toNext(60, 5))).toBeOnTheScreen();
    expect(screen.getByLabelText(meCopy.streak(3))).toBeOnTheScreen();
    expect(screen.getByLabelText(meCopy.sparks(640))).toBeOnTheScreen();
  });

  it("top level says so", async () => {
    (getProgress as jest.Mock).mockResolvedValue(progress({ sparks: 3200, level: 10 }));
    await renderMe();
    expect(await screen.findByText(meCopy.topLevel)).toBeOnTheScreen();
  });

  it("badge shelf counts earned badges and explains one on tap", async () => {
    await renderMe();
    expect(await screen.findByText(meCopy.badgeCount(1, BADGE_KEYS.length))).toBeOnTheScreen();
    expect(screen.getAllByRole("button", { name: /, not yet$/ })).toHaveLength(
      BADGE_KEYS.length - 1,
    );
    await userEvent.setup().press(screen.getByRole("button", { name: "First Save, earned" }));
    expect(screen.getByText(/Save money for the first time/)).toBeOnTheScreen();
  });

  it("picking a lid saves the look", async () => {
    await renderMe();
    await userEvent
      .setup()
      .press(await screen.findByRole("radio", { name: lookCopy.lidLabel(lookCopy.lid.grape) }));
    await waitFor(() =>
      expect(setJarsoLook).toHaveBeenCalledWith({}, { lid: "grape", wear: "none" }),
    );
  });

  it("locked wear can't be picked on Me", async () => {
    await renderMe();
    const crown = await screen.findByRole("radio", {
      name: lookCopy.lockedLabel(lookCopy.wear.crown, 5),
    });
    expect(crown.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("hides the trophy room while progress can't load, settings still work", async () => {
    (getProgress as jest.Mock).mockRejectedValue(new Error("down"));
    await renderMe();
    expect(await screen.findByLabelText("Sign out")).toBeOnTheScreen();
    expect(screen.queryByText(meCopy.badgesHeading)).toBeNull();
  });
});

describe("MeScreen settings", () => {
  beforeEach(async () => {
    await act(() => colorScheme.set("light"));
  });

  it("the sound switch turns sound effects off", async () => {
    await renderMe();
    const sound = screen.getByRole("switch", { name: meCopy.sound, checked: true });
    await userEvent.setup().press(sound);
    expect(mockSetSound).toHaveBeenCalledWith(false);
    expect(useSoundOn).toHaveBeenCalled();
  });

  it("My asks opens the asks page", async () => {
    await renderMe();
    await userEvent.setup().press(screen.getByRole("button", { name: meCopy.myAsks }));
    expect(mockPush).toHaveBeenCalledWith("/(child)/requests");
  });

  it("Replay the intro opens the intro", async () => {
    await renderMe();
    await userEvent.setup().press(screen.getByRole("button", { name: "Replay the intro" }));
    expect(mockPush).toHaveBeenCalledWith("/(child)/onboarding");
  });

  it("has one Dark mode switch, off in light mode", async () => {
    await renderMe();
    expect(
      await screen.findByRole("switch", { name: profileCopy.darkMode, checked: false }),
    ).toBeOnTheScreen();
  });

  it("turns dark mode on, applies it and stores it under 'theme'", async () => {
    const set = jest.spyOn(colorScheme, "set");
    await renderMe();
    await userEvent
      .setup()
      .press(await screen.findByRole("switch", { name: profileCopy.darkMode }));
    expect(set).toHaveBeenCalledWith("dark");
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith("theme", "dark"));
  });

  it("explains how to sign back in and signs out", async () => {
    await renderMe();
    expect(
      screen.getByText("You can sign back in with your family code, nickname and PIN."),
    ).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByLabelText("Sign out")));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("opens the child's Notifications page", async () => {
    await renderMe();
    await userEvent.setup().press(screen.getByRole("button", { name: noticeGroupCopy.title }));
    expect(mockPush).toHaveBeenCalledWith("/(child)/notifications");
  });

  it("hides What Jarso remembers while Jarso is off and nothing is kept", async () => {
    await renderMe();
    await waitFor(() => expect(listMemories).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: guideCopy.memories.title })).toBeNull();
  });

  it("shows how many notes Jarso keeps, even with Jarso off, and opens them", async () => {
    (listMemories as jest.Mock).mockResolvedValue([note("m1", "Football"), note("m2", "Bikes")]);
    await renderMe();
    const row = await screen.findByRole("button", { name: guideCopy.memories.title });
    expect(screen.getByText("2 notes")).toBeOnTheScreen();
    await userEvent.setup().press(row);
    expect(mockPush).toHaveBeenCalledWith("/(child)/memories");
  });

  it("shows the row with no notes yet while Jarso is on", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ available: true, introNeeded: false });
    await renderMe();
    expect(await screen.findByText("0 notes")).toBeOnTheScreen();
  });

  it("warns first, then signs out on the second tap with purchases on the phone", async () => {
    (useOutboxItems as jest.Mock).mockReturnValue([{ id: "a" }]);
    await renderMe();
    await act(async () => fireEvent.press(screen.getByLabelText("Sign out")));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.getByText(offlineCopy.signOutWaiting)).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByLabelText(offlineCopy.signOutAnyway)));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    (useOutboxItems as jest.Mock).mockReturnValue([]);
  });
});

describe("MeScreen nickname", () => {
  it("shows the nickname as the trophy card's header and the sign-in line", async () => {
    (findNickname as jest.Mock).mockResolvedValue("Maya");
    await renderMe();
    expect(await screen.findByRole("header", { name: "Maya" })).toBeOnTheScreen();
    expect(
      await screen.findByText("You sign in as Maya. A parent can change your nickname or PIN."),
    ).toBeOnTheScreen();
  });

  it.each([
    ["no nickname", () => (findNickname as jest.Mock).mockResolvedValue(null)],
    ["a failed read", () => (findNickname as jest.Mock).mockRejectedValue(new Error("down"))],
  ])("uses the fallback line for %s", async (_name, arrange) => {
    arrange();
    await renderMe();
    expect(
      await screen.findByText(
        "Your nickname is how you sign in. A parent can change your nickname or PIN.",
      ),
    ).toBeOnTheScreen();
  });
});

describe("MemoriesScreen", () => {
  it("lists each note with Forget", async () => {
    (listMemories as jest.Mock).mockResolvedValue([note("m1", "Football")]);
    await renderMe(<MemoriesScreen />);
    expect(await screen.findByText(/Football/)).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: `${guideCopy.memories.forget}: Football` }),
    ).toBeOnTheScreen();
  });

  it("leaves the title to the page header", async () => {
    (listMemories as jest.Mock).mockResolvedValue([note("m1", "Football")]);
    await renderMe(<MemoriesScreen />);
    await screen.findByText(/Football/);
    expect(screen.queryByRole("header", { name: guideCopy.memories.title })).toBeNull();
  });
});

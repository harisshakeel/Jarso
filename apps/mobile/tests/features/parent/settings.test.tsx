import { familySettingsCopy, nicknameTaken } from "@jarso/core/family";
import { parentGuideCopy } from "@jarso/core/guide";
import { AppError } from "@jarso/core/lib";
import { noticeGroupCopy } from "@jarso/core/notifications";
import { profileCopy } from "@jarso/core/profiles";
import {
  findFamilyById,
  findMembership,
  listChildMembers,
  renameChildMember,
  updateFamilyTimezone,
} from "@jarso/data/family";
import { findParentDetails, findProfileById, updateProfileById } from "@jarso/data/profiles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { colorScheme } from "nativewind";
import type { ReactElement } from "react";
import { Share } from "react-native";
import { SHARE_CODE } from "@/features/family";
import {
  AccountSettingsScreen,
  ChildSettingsScreen,
  ParentSettingsScreen,
  TimezoneSettingsScreen,
} from "@/features/parent";
import { apiFetch } from "@/lib/api";
import { flash } from "@/lib/flash";

const mockSignOut = jest.fn();
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({
    status: "parent",
    role: "parent",
    userId: "parent-1",
    signOut: mockSignOut,
  }),
}));
jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return {
    useRouter: jest.fn(),
    Redirect: ({ href }: { href: string }) => <Text>{`Redirect ${href}`}</Text>,
    Stack: {
      Screen: ({ options }: { options: { title: string } }) => <Text>{options.title}</Text>,
    },
  };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
  renameChildMember: jest.fn(),
  updateFamilyTimezone: jest.fn(),
}));
jest.mock("@jarso/data/profiles", () => ({
  findProfileById: jest.fn(),
  findParentDetails: jest.fn(),
  updateProfileById: jest.fn(),
  upsertParentDetails: jest.fn(),
}));
jest.mock("@jarso/data/guide", () => ({ saveGuideAccess: jest.fn() }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const api = apiFetch as jest.Mock;
const push = jest.fn();
const back = jest.fn();
const replace = jest.fn();

const SAM = "11111111-1111-4111-8111-111111111111";
const MIA = "22222222-2222-4222-8222-222222222222";

function guideState(state: { configured: boolean; enabledChildIds: string[] }) {
  api.mockImplementation(async (path: string) => {
    if (path === "/api/v1/guide/state") return state;
    return { ok: true };
  });
}

function setup() {
  (useRouter as jest.Mock).mockReturnValue({ push, back, replace, canGoBack: () => true });
  guideState({ configured: false, enabledChildIds: [] });
  (findMembership as jest.Mock).mockResolvedValue({
    familyId: "family-1",
    role: "parent",
    status: "approved",
  });
  (findFamilyById as jest.Mock).mockResolvedValue({
    id: "family-1",
    code: "ABC123",
    currency: "GBP",
    timezone: "Europe/London",
  });
  (listChildMembers as jest.Mock).mockResolvedValue([{ id: SAM, nickname: "Sam" }]);
  (findProfileById as jest.Mock).mockResolvedValue({
    id: "parent-1",
    fullName: "Pat",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
  });
  (findParentDetails as jest.Mock).mockResolvedValue({
    dateOfBirth: "1985-04-02",
    country: "GB",
    gender: "female",
    completedAt: "2026-11-04T00:00:00Z",
  });
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

describe("ParentSettingsScreen (the menu)", () => {
  it("shows the family code compactly and shares it", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });
    await renderWithClient(<ParentSettingsScreen />);
    expect(await screen.findByText("ABC123")).toBeOnTheScreen();
    expect(screen.getByText(familySettingsCopy.codeShort)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: SHARE_CODE }));
    expect(share).toHaveBeenCalledWith({ message: "ABC123" });
  });

  it("lists each child with Jarso's state and opens the child's settings page", async () => {
    (listChildMembers as jest.Mock).mockResolvedValue([
      { id: SAM, nickname: "Sam" },
      { id: MIA, nickname: "Mia" },
    ]);
    guideState({ configured: true, enabledChildIds: [SAM] });
    await renderWithClient(<ParentSettingsScreen />);
    expect(
      await screen.findByRole("header", { name: familySettingsCopy.childrenTitle }),
    ).toBeOnTheScreen();
    expect(await screen.findByText(parentGuideCopy.childState(true))).toBeOnTheScreen();
    expect(screen.getByText(parentGuideCopy.childState(false))).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "Mia" }));
    expect(push).toHaveBeenCalledWith({
      pathname: "/(parent)/settings/children/[childId]",
      params: { childId: MIA },
    });
  });

  it("gives a child row no Jarso line while Jarso isn't set up", async () => {
    await renderWithClient(<ParentSettingsScreen />);
    expect(await screen.findByRole("button", { name: "Sam" })).toBeOnTheScreen();
    expect(screen.queryByText(parentGuideCopy.childState(false))).not.toBeOnTheScreen();
  });

  it("opens each page from its row", async () => {
    const user = userEvent.setup();
    await renderWithClient(<ParentSettingsScreen />);
    // Each row shows the current value as its subtitle.
    expect(await screen.findByText("Europe/London")).toBeOnTheScreen();
    expect(await screen.findByText("Pat")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: familySettingsCopy.addChild }));
    await user.press(screen.getByRole("button", { name: familySettingsCopy.timezone }));
    await user.press(
      screen.getByRole("button", { name: familySettingsCopy.acceptChildInvitation }),
    );
    await user.press(screen.getByRole("button", { name: profileCopy.accountTitle }));
    await user.press(screen.getByRole("button", { name: noticeGroupCopy.title }));
    expect(push.mock.calls.map(([href]) => href)).toEqual([
      "/(parent)/children/new",
      "/(parent)/settings/timezone",
      "/(parent)/invite",
      "/(parent)/settings/account",
      "/(parent)/notifications",
    ]);
    // The forms now live on those pages.
    expect(screen.queryByRole("button", { name: familySettingsCopy.save })).toBeNull();
    expect(screen.queryByRole("button", { name: profileCopy.saveName })).toBeNull();
  });

  it("flips dark mode right on the menu", async () => {
    await act(() => colorScheme.set("light"));
    await renderWithClient(<ParentSettingsScreen />);
    await userEvent
      .setup()
      .press(await screen.findByRole("switch", { name: profileCopy.darkMode, checked: false }));
    expect(
      screen.getByRole("switch", { name: profileCopy.darkMode, checked: true }),
    ).toBeOnTheScreen();
  });

  it("signs out", async () => {
    await renderWithClient(<ParentSettingsScreen />);
    await userEvent.setup().press(await screen.findByRole("button", { name: "Sign out" }));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("before setup shows only the You group and Sign out", async () => {
    (findMembership as jest.Mock).mockResolvedValue(null);
    await renderWithClient(<ParentSettingsScreen />);
    expect(await screen.findByRole("button", { name: profileCopy.accountTitle })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByLabelText("Loading")).toBeNull());
    expect(screen.queryByText(familySettingsCopy.codeEyebrow)).toBeNull();
    expect(screen.queryByRole("header", { name: familySettingsCopy.childrenTitle })).toBeNull();
    expect(screen.queryByRole("button", { name: familySettingsCopy.timezone })).toBeNull();
  });
});

describe("ChildSettingsScreen", () => {
  it("titles the page with the nickname and says how the child signs in", async () => {
    await renderWithClient(<ChildSettingsScreen childId={SAM} />);
    expect(await screen.findByText(familySettingsCopy.childSignsIn("ABC123"))).toBeOnTheScreen();
    expect(screen.getAllByText("Sam").length).toBeGreaterThan(0);
    expect(screen.getByText(familySettingsCopy.nicknameIs("Sam"))).toBeOnTheScreen();
    expect(screen.getByText(familySettingsCopy.pinRowBody)).toBeOnTheScreen();
    // No Jarso group while Jarso isn't set up.
    expect(screen.queryByRole("header", { name: parentGuideCopy.settingsGroup })).toBeNull();
  });

  it("shows Jarso's switch for the child while Jarso is set up", async () => {
    guideState({ configured: true, enabledChildIds: [SAM] });
    await renderWithClient(<ChildSettingsScreen childId={SAM} />);
    expect(
      await screen.findByRole("header", { name: parentGuideCopy.settingsGroup }),
    ).toBeOnTheScreen();
    expect(
      await screen.findByRole("switch", { name: parentGuideCopy.switchLabel("Sam") }),
    ).toBeOnTheScreen();
  });

  it("rename taken shows nicknameTaken under the field", async () => {
    (renameChildMember as jest.Mock).mockRejectedValue(
      new AppError("CONFLICT", "That nickname is taken"),
    );
    const user = userEvent.setup();
    await renderWithClient(<ChildSettingsScreen childId={SAM} />);
    await user.press(
      await screen.findByRole("button", { name: familySettingsCopy.rename, expanded: false }),
    );
    expect(
      screen.getByRole("button", { name: familySettingsCopy.rename, expanded: true }),
    ).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText(familySettingsCopy.nickname), "Mia");
    await user.press(screen.getByRole("button", { name: familySettingsCopy.saveNickname }));
    expect(await screen.findByText(nicknameTaken)).toBeOnTheScreen();
    expect(renameChildMember).toHaveBeenCalledWith({ id: "client" }, SAM, "Mia");
  });

  it("new PIN calls the pin route with the bearer", async () => {
    const user = userEvent.setup();
    await renderWithClient(<ChildSettingsScreen childId={SAM} />);
    await user.press(await screen.findByRole("button", { name: familySettingsCopy.resetPin }));
    fireEvent.changeText(screen.getByLabelText(familySettingsCopy.newPin), "1234");
    await user.press(screen.getByRole("button", { name: familySettingsCopy.savePin }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/api/v1/children/${SAM}/pin`, {
        method: "PATCH",
        body: { pin: "1234" },
        auth: true,
      }),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(familySettingsCopy.pinUpdated("Sam")));
  });

  it("remove failure keeps the dialog open with the error", async () => {
    api.mockImplementation(async (path: string) => {
      if (path === "/api/v1/guide/state") return { configured: false, enabledChildIds: [] };
      throw new AppError("FORBIDDEN", "You can't do that.");
    });
    const user = userEvent.setup();
    await renderWithClient(<ChildSettingsScreen childId={SAM} />);
    await user.press(
      await screen.findByRole("button", { name: familySettingsCopy.removeFromFamily("Sam") }),
    );
    expect(screen.getByText(familySettingsCopy.removeTitle("Sam"))).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: familySettingsCopy.removeChild("Sam") }));
    expect(await screen.findByText("You can't do that.")).toBeOnTheScreen();
    expect(api).toHaveBeenCalledWith(`/api/v1/children/${SAM}`, {
      method: "DELETE",
      auth: true,
    });
    expect(screen.getByText(familySettingsCopy.removeTitle("Sam"))).toBeOnTheScreen();
    expect(flash).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it("remove success goes back to Settings", async () => {
    const user = userEvent.setup();
    await renderWithClient(<ChildSettingsScreen childId={SAM} />);
    await user.press(
      await screen.findByRole("button", { name: familySettingsCopy.removeFromFamily("Sam") }),
    );
    // The family is read again without Sam once the removal is through.
    (listChildMembers as jest.Mock).mockResolvedValue([]);
    await user.press(screen.getByRole("button", { name: familySettingsCopy.removeChild("Sam") }));
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(flash).toHaveBeenCalledWith(familySettingsCopy.removed("Sam"));
    expect(screen.queryByText(/^Redirect/)).toBeNull();
  });

  it("sends an unknown child back to Settings", async () => {
    await renderWithClient(<ChildSettingsScreen childId="nobody" />);
    expect(await screen.findByText("Redirect /(parent)/settings")).toBeOnTheScreen();
  });
});

describe("TimezoneSettingsScreen", () => {
  it("saves the timezone and keeps the currency note", async () => {
    const user = userEvent.setup();
    await renderWithClient(<TimezoneSettingsScreen />);
    expect(
      await screen.findByText(familySettingsCopy.familyBody("British pound (£)")),
    ).toBeOnTheScreen();
    expect(screen.getByText(familySettingsCopy.timezoneHelp)).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText(familySettingsCopy.timezone), "Asia/Kolkata");
    await user.press(screen.getByRole("button", { name: familySettingsCopy.save }));
    await waitFor(() =>
      expect(updateFamilyTimezone).toHaveBeenCalledWith({ id: "client" }, "Asia/Kolkata"),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(familySettingsCopy.saved));
  });
});

describe("AccountSettingsScreen", () => {
  it("saves the name and shows the details form", async () => {
    const user = userEvent.setup();
    await renderWithClient(<AccountSettingsScreen />);
    expect(await screen.findByRole("header", { name: profileCopy.detailsTitle })).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText(profileCopy.name), "Pat Lee");
    await user.press(screen.getByRole("button", { name: profileCopy.saveName }));
    await waitFor(() => expect(updateProfileById).toHaveBeenCalled());
    await waitFor(() => expect(flash).toHaveBeenCalledWith(profileCopy.nameSaved));
  });

  it("before setup has only the name (setup asks for the details)", async () => {
    (findParentDetails as jest.Mock).mockResolvedValue(null);
    await renderWithClient(<AccountSettingsScreen />);
    expect(await screen.findByLabelText(profileCopy.name)).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: profileCopy.detailsTitle })).toBeNull();
  });
});

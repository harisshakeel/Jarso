import { familySettingsCopy, nicknameTaken } from "@jarso/core/family";
import { AppError } from "@jarso/core/lib";
import { profileCopy } from "@jarso/core/profiles";
import {
  findFamilyById,
  findMembership,
  listChildMembers,
  renameChildMember,
} from "@jarso/data/family";
import { findParentDetails, findProfileById } from "@jarso/data/profiles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";
import { SHARE_CODE } from "@/features/family";
import { ParentSettingsScreen } from "@/features/parent";
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

function setup() {
  api.mockImplementation(async (path: string) => {
    if (path === "/api/v1/guide/state") return { configured: false, enabledChildIds: [] };
    return { ok: true };
  });
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
  (listChildMembers as jest.Mock).mockResolvedValue([
    { id: "11111111-1111-4111-8111-111111111111", nickname: "Sam" },
  ]);
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

const SAM = "11111111-1111-4111-8111-111111111111";

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ParentSettingsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

describe("ParentSettingsScreen", () => {
  it("family code shows and shares", async () => {
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction", activityType: undefined });
    await renderSettings();
    expect(await screen.findByText("ABC123")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: SHARE_CODE }));
    expect(share).toHaveBeenCalledWith({ message: "ABC123" });
  });

  it("rename taken shows nicknameTaken under the field", async () => {
    (renameChildMember as jest.Mock).mockRejectedValue(
      new AppError("CONFLICT", "That nickname is taken"),
    );
    const user = userEvent.setup();
    await renderSettings();
    await user.press(
      await screen.findByRole("button", {
        name: `${familySettingsCopy.rename}${familySettingsCopy.resetPinFor("Sam")}`,
      }),
    );
    fireEvent.changeText(screen.getByLabelText(familySettingsCopy.nickname), "Mia");
    await user.press(screen.getByRole("button", { name: familySettingsCopy.saveNickname }));
    expect(await screen.findByText(nicknameTaken)).toBeOnTheScreen();
    expect(renameChildMember).toHaveBeenCalledWith({ id: "client" }, SAM, "Mia");
  });

  it("new PIN calls the pin route with the bearer", async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.press(
      await screen.findByRole("button", {
        name: `${familySettingsCopy.resetPin}${familySettingsCopy.resetPinFor("Sam")}`,
      }),
    );
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
    await renderSettings();
    await user.press(
      await screen.findByRole("button", {
        name: `${familySettingsCopy.remove}${familySettingsCopy.resetPinFor("Sam")}`,
      }),
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
  });

  it("signs out", async () => {
    await renderSettings();
    await userEvent.setup().press(await screen.findByRole("button", { name: "Sign out" }));
    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.getByText(profileCopy.signOutTitle)).toBeOnTheScreen();
  });
});

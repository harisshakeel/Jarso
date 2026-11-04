import { setupCopy } from "@jarso/core/family";
import { profileCopy } from "@jarso/core/profiles";
import { findMembership } from "@jarso/data/family";
import { findParentDetails, upsertParentDetails } from "@jarso/data/profiles";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";

let mockSession = { status: "parent", role: "parent", userId: "parent-1" };
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ ...mockSession, retry: jest.fn(), signOut: jest.fn() }),
}));
jest.mock("@/features/news", () => ({ NoticeListener: () => null }));
jest.mock("@/lib/outbox", () => ({ OutboxSync: () => null }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));

// create_family through a fake client, so createFamilyWithFallback's own fallback is under test.
const mockDb = { rpc: jest.fn(), from: jest.fn() };
jest.mock("@/lib/supabase/client", () => ({ supabase: mockDb }));
jest.mock("@jarso/data/profiles", () => ({
  findParentDetails: jest.fn(),
  upsertParentDetails: jest.fn(),
}));
jest.mock("@jarso/data/family", () => ({
  ...jest.requireActual("@jarso/data/family"),
  findMembership: jest.fn(),
}));

const details = {
  dateOfBirth: "1985-04-02",
  country: "GB",
  gender: "female",
  completedAt: "2026-11-04T00:00:00Z",
};
const membership = { familyId: "family-1", role: "parent", status: "approved" };
const family = { id: "family-1", code: "ABC123", currency: "GBP", timezone: "UTC" };

function familyRead() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: family, error: null }),
  };
  return chain;
}

function Root() {
  const [client] = require("react").useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}

function Bare() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function InviteStub() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Text>{`Invite code=${code ?? "-"}`}</Text>;
}

function renderApp(initialUrl: string) {
  return renderRouter(
    {
      _layout: Root,
      "(parent)/_layout": require("../../../app/(parent)/_layout"),
      "(parent)/(tabs)/_layout": Bare,
      "(parent)/(tabs)/index": () => <Text>Family home</Text>,
      "(parent)/(tabs)/inbox": () => <Text>Inbox</Text>,
      "(parent)/setup": require("../../../app/(parent)/setup"),
      "(parent)/settings": () => <Text>Settings</Text>,
      "(parent)/invite": InviteStub,
      "(auth)/sign-in": () => <Text>Sign in</Text>,
    },
    { initialUrl },
  );
}

/** The Android date dialog answers with this day (local midnight, as the picker does). */
function pickDate(iso: string) {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  (DateTimePickerAndroid.open as jest.Mock).mockImplementation(({ onChange }) =>
    onChange({ type: "set", nativeEvent: {} }, new Date(y, m - 1, d)),
  );
}

async function fillProfile(dateOfBirth = "1985-04-02") {
  const user = userEvent.setup();
  pickDate(dateOfBirth);
  await user.press(screen.getByRole("button", { name: profileCopy.dateOfBirth }));
  await fireEvent.changeText(screen.getByLabelText(profileCopy.country), "United King");
  await user.press(await screen.findByRole("radio", { name: "United Kingdom" }));
  await user.press(screen.getByRole("radio", { name: "Prefer not to say" }));
  await user.press(screen.getByRole("button", { name: profileCopy.completeSubmit }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { status: "parent", role: "parent", userId: "parent-1" };
  (findParentDetails as jest.Mock).mockReset().mockResolvedValue(details);
  (findMembership as jest.Mock).mockReset().mockResolvedValue(membership);
  (upsertParentDetails as jest.Mock).mockReset().mockResolvedValue(undefined);
  mockDb.rpc.mockReset().mockResolvedValue({ data: "family-1", error: null });
  mockDb.from.mockReset().mockImplementation(familyRead);
});

describe("setup gate", () => {
  it("setup gate clears after profile then family", async () => {
    (findParentDetails as jest.Mock).mockResolvedValue(null);
    (findMembership as jest.Mock).mockResolvedValue(null);
    await renderApp("/");

    expect(await screen.findByText(profileCopy.completeTitle)).toBeOnTheScreen();
    expect(screen).toHavePathname("/setup");
    expect(screen.queryByText(setupCopy.title)).not.toBeOnTheScreen();

    (findParentDetails as jest.Mock).mockResolvedValue(details);
    await fillProfile();
    await waitFor(() =>
      expect(upsertParentDetails).toHaveBeenCalledWith(mockDb, {
        dateOfBirth: "1985-04-02",
        country: "GB",
        gender: "prefer_not_to_say",
      }),
    );
    expect(await screen.findByText(setupCopy.title)).toBeOnTheScreen();

    (findMembership as jest.Mock).mockResolvedValue(membership);
    await userEvent.setup().press(screen.getByRole("button", { name: setupCopy.create }));

    expect(await screen.findByText("Family home")).toBeOnTheScreen();
    expect(screen).toHavePathname("/");
    expect(mockDb.rpc).toHaveBeenCalledWith("create_family", {
      p_currency: expect.any(String),
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    // No second trip through setup once both steps are done.
    await waitFor(() => expect(screen.queryByText(setupCopy.title)).not.toBeOnTheScreen());
    expect(screen).toHavePathname("/");
  });

  it("parent route redirects to setup when profile incomplete", async () => {
    (findParentDetails as jest.Mock).mockResolvedValue(null);
    await renderApp("/inbox");
    expect(await screen.findByText(profileCopy.completeTitle)).toBeOnTheScreen();
    expect(screen.queryByText("Notifications")).not.toBeOnTheScreen();
    expect(screen).toHavePathname("/setup");
  });

  it("shows only the family step when the profile is done", async () => {
    (findMembership as jest.Mock).mockResolvedValue(null);
    await renderApp("/");
    expect(await screen.findByText(setupCopy.title)).toBeOnTheScreen();
    expect(screen.queryByText(profileCopy.completeTitle)).not.toBeOnTheScreen();
  });

  it("keeps next through setup", async () => {
    (findMembership as jest.Mock).mockResolvedValue(null);
    await renderApp("/inbox");
    expect(await screen.findByText(setupCopy.title)).toBeOnTheScreen();
    (findMembership as jest.Mock).mockResolvedValue(membership);
    await userEvent.setup().press(screen.getByRole("button", { name: setupCopy.create }));
    expect(await screen.findByText("Inbox")).toBeOnTheScreen();
    expect(screen).toHavePathname("/inbox");
  });

  it("keeps an invite link's query through setup", async () => {
    (findMembership as jest.Mock).mockResolvedValue(null);
    await renderApp("/invite?code=ABCD1234");
    expect(await screen.findByText(setupCopy.title)).toBeOnTheScreen();
    (findMembership as jest.Mock).mockResolvedValue(membership);
    await userEvent.setup().press(screen.getByRole("button", { name: setupCopy.create }));
    expect(await screen.findByText("Invite code=ABCD1234")).toBeOnTheScreen();
    expect(screen).toHavePathname("/invite");
  });

  it("leaves settings open before setup", async () => {
    (findParentDetails as jest.Mock).mockResolvedValue(null);
    await renderApp("/settings");
    expect(await screen.findByText("Settings")).toBeOnTheScreen();
  });

  it("shows the offline notice with Retry while the setup read fails", async () => {
    const { AppError } = jest.requireActual("@jarso/core/lib");
    (findParentDetails as jest.Mock).mockRejectedValueOnce(new AppError("UNAVAILABLE", "offline"));
    await renderApp("/inbox");
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("Inbox")).not.toBeOnTheScreen();

    await userEvent.setup().press(retry);
    expect(await screen.findByText("Inbox")).toBeOnTheScreen();
  });
});

describe("setup steps", () => {
  it('under-18 date shows "You need to be 18 or over"', async () => {
    (findParentDetails as jest.Mock).mockResolvedValue(null);
    await renderApp("/setup");
    await screen.findByText(profileCopy.completeTitle);

    const now = new Date();
    const tenYearsAgo = `${now.getFullYear() - 10}-01-15`;
    await fillProfile(tenYearsAgo);

    expect(await screen.findByText("You need to be 18 or over")).toBeOnTheScreen();
    expect(upsertParentDetails).not.toHaveBeenCalled();
  });

  it("rejected timezone still creates the family", async () => {
    (findMembership as jest.Mock).mockResolvedValue(null);
    mockDb.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "22023", message: "bad zone" } })
      .mockResolvedValue({ data: "family-1", error: null });
    await renderApp("/");
    await screen.findByText(setupCopy.title);

    (findMembership as jest.Mock).mockResolvedValue(membership);
    await userEvent.setup().press(screen.getByRole("button", { name: setupCopy.create }));

    expect(await screen.findByText("Family home")).toBeOnTheScreen();
    expect(mockDb.rpc).toHaveBeenCalledTimes(2);
    expect(mockDb.rpc).toHaveBeenLastCalledWith("create_family", {
      p_currency: expect.any(String),
      p_timezone: "UTC",
    });
  });

  it("picks the currency", async () => {
    (findMembership as jest.Mock).mockResolvedValue(null);
    await renderApp("/");
    await screen.findByText(setupCopy.title);
    const user = userEvent.setup();
    await user.press(screen.getByRole("radio", { name: "Indian rupee (₹)" }));
    (findMembership as jest.Mock).mockResolvedValue(membership);
    await user.press(screen.getByRole("button", { name: setupCopy.create }));
    await waitFor(() =>
      expect(mockDb.rpc).toHaveBeenCalledWith("create_family", {
        p_currency: "INR",
        p_timezone: expect.any(String),
      }),
    );
  });
});

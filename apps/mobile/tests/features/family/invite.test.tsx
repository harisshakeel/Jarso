import { invitationGone, inviteCopy, nicknameTaken, setupCopy } from "@jarso/core/family";
import { findMembership, listInvitationsForCaller } from "@jarso/data/family";
import { findParentDetails } from "@jarso/data/profiles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Text } from "react-native";
import { AppError } from "@/lib";
import { apiFetch } from "@/lib/api";

type MockSession = { status: string; role?: "child" | "parent"; userId?: string };

// A tiny store, so a test can sign the parent in and every screen re-renders.
const mockAuth = {
  session: { status: "signed-out" } as MockSession,
  listeners: new Set<() => void>(),
  set(next: MockSession) {
    mockAuth.session = next;
    for (const listener of mockAuth.listeners) listener();
  },
};
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => {
    const session = require("react").useSyncExternalStore(
      (listener: () => void) => {
        mockAuth.listeners.add(listener);
        return () => mockAuth.listeners.delete(listener);
      },
      () => mockAuth.session,
    );
    return { ...session, retry: jest.fn(), signOut: jest.fn() };
  },
}));
jest.mock("@/features/news", () => ({ NoticeListener: () => null }));
jest.mock("@/lib/outbox", () => ({ OutboxSync: () => null }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));

const mockDb = { rpc: jest.fn(), from: jest.fn() };
jest.mock("@/lib/supabase/client", () => ({ supabase: mockDb }));
jest.mock("@jarso/data/profiles", () => ({
  findParentDetails: jest.fn(),
  upsertParentDetails: jest.fn(),
}));
jest.mock("@jarso/data/family", () => ({
  ...jest.requireActual("@jarso/data/family"),
  findMembership: jest.fn(),
  listInvitationsForCaller: jest.fn(),
}));

const CHILD = "22222222-2222-4222-8222-222222222222";
const LISTED = "33333333-3333-4333-8333-333333333333";
const PARENT: MockSession = { status: "parent", role: "parent", userId: "parent-1" };
const details = {
  dateOfBirth: "1985-04-02",
  country: "GB",
  gender: "female",
  completedAt: "2026-11-04T00:00:00Z",
};
const membership = { familyId: "family-1", role: "parent", status: "approved" };
const family = { id: "family-1", code: "ABC123", currency: "GBP", timezone: "UTC" };
const api = apiFetch as jest.Mock;

/** `families` read after create_family. */
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

function HubStub() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  return <Text>{`Hub ${childId}`}</Text>;
}

function renderApp(initialUrl: string) {
  return renderRouter(
    {
      _layout: Root,
      "(parent)/_layout": require("../../../app/(parent)/_layout"),
      "(parent)/(tabs)/_layout": Bare,
      "(parent)/(tabs)/index": () => <Text>Family home</Text>,
      "(parent)/setup": require("../../../app/(parent)/setup"),
      "(parent)/invite": require("../../../app/(parent)/invite"),
      "(parent)/children/[childId]/index": HubStub,
      "(auth)/sign-in": require("../../../app/(auth)/sign-in"),
    },
    { initialUrl },
  );
}

type Reply = { lookup?: () => unknown; accept?: () => unknown };

/** The bearer routes: guide state (Jarso on), the lookup and the accept. */
function answer({ lookup = () => ({ nickname: "Mia" }), accept }: Reply = {}) {
  api.mockImplementation(async (path: string) => {
    if (path === "/api/v1/guide/state") return { configured: true, enabledChildIds: [] };
    if (path === "/api/v1/invitations/lookup") return lookup();
    if (path === "/api/v1/invitations") return accept ? accept() : { id: CHILD, nickname: "Mia" };
    throw new Error(`unexpected ${path}`);
  });
}

async function acceptWithPin() {
  await fireEvent.changeText(screen.getByLabelText(inviteCopy.pin), "1234");
  const user = userEvent.setup();
  await user.press(screen.getByRole("checkbox", { name: inviteCopy.consent }));
  await user.press(screen.getByRole("button", { name: inviteCopy.submit }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.session = PARENT;
  (findParentDetails as jest.Mock).mockReset().mockResolvedValue(details);
  (findMembership as jest.Mock).mockReset().mockResolvedValue(membership);
  (listInvitationsForCaller as jest.Mock).mockReset().mockResolvedValue([]);
  mockDb.rpc.mockReset().mockResolvedValue({ data: "family-1", error: null });
  mockDb.from.mockReset().mockImplementation(familyRead);
  answer();
});

describe("invite", () => {
  it("invite link survives sign-in and setup", async () => {
    mockAuth.session = { status: "signed-out" };
    (findMembership as jest.Mock).mockResolvedValue(null);
    await renderApp("/invite?code=ABCD1234");

    await waitFor(() => expect(screen).toHavePathname("/sign-in"));
    expect(screen).toHaveSearchParams({ next: "/invite?code=ABCD1234" });

    await act(async () => mockAuth.set(PARENT));
    expect(await screen.findByText(setupCopy.title)).toBeOnTheScreen();
    expect(screen).toHavePathname("/setup");

    (findMembership as jest.Mock).mockResolvedValue(membership);
    await userEvent.setup().press(screen.getByRole("button", { name: setupCopy.create }));

    expect(await screen.findByDisplayValue("Mia")).toBeOnTheScreen();
    expect(screen).toHavePathname("/invite");
    expect(screen).toHaveSearchParams({ code: "ABCD1234" });
    expect(api).toHaveBeenCalledWith("/api/v1/invitations/lookup", {
      method: "POST",
      body: { invite: "ABCD1234" },
      auth: true,
    });
  });

  it("unknown code shows INVITATION_GONE", async () => {
    answer({
      lookup: () => {
        throw new AppError("NOT_FOUND", invitationGone);
      },
    });
    await renderApp("/invite?code=NOPE0000");

    expect(await screen.findByText(invitationGone)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: inviteCopy.backToFamily })).toBeOnTheScreen();
    expect(screen.queryByLabelText(inviteCopy.pin)).not.toBeOnTheScreen();
  });

  it("looks the code up once and accepts by token or code", async () => {
    await renderApp("/invite?token=tok-123&code=IGNORED1");
    expect(await screen.findByDisplayValue("Mia")).toBeOnTheScreen();
    await acceptWithPin();

    expect(await screen.findByText(`Hub ${CHILD}`)).toBeOnTheScreen();
    const lookups = api.mock.calls.filter(([path]) => path === "/api/v1/invitations/lookup");
    expect(lookups).toEqual([
      ["/api/v1/invitations/lookup", { method: "POST", body: { invite: "tok-123" }, auth: true }],
    ]);
    expect(api).toHaveBeenCalledWith("/api/v1/invitations", {
      method: "POST",
      body: { invite: "tok-123", nickname: "Mia", pin: "1234", consent: true },
      auth: true,
    });
  });

  it("listed invitation accepts by id", async () => {
    (listInvitationsForCaller as jest.Mock).mockResolvedValue([
      {
        id: LISTED,
        nickname: "Mia",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ]);
    await renderApp("/invite");

    expect(await screen.findByText(inviteCopy.listTitle)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: `${inviteCopy.accept} Mia` }));
    expect(await screen.findByDisplayValue("Mia")).toBeOnTheScreen();
    await acceptWithPin();

    expect(await screen.findByText(`Hub ${CHILD}`)).toBeOnTheScreen();
    expect(api).toHaveBeenCalledWith("/api/v1/invitations", {
      method: "POST",
      body: { invitationId: LISTED, nickname: "Mia", pin: "1234", consent: true },
      auth: true,
    });
    expect(api).not.toHaveBeenCalledWith("/api/v1/invitations/lookup", expect.anything());
  });

  it("an id not in the parent's list is gone", async () => {
    await renderApp(`/invite?id=${LISTED}`);
    expect(await screen.findByText(invitationGone)).toBeOnTheScreen();
  });

  it("the code form looks the code up", async () => {
    await renderApp("/invite");
    expect(await screen.findByText(inviteCopy.empty)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(inviteCopy.code), " abcd1234 ");
    await userEvent.setup().press(screen.getByRole("button", { name: inviteCopy.continue }));

    expect(await screen.findByDisplayValue("Mia")).toBeOnTheScreen();
    expect(api).toHaveBeenCalledWith("/api/v1/invitations/lookup", {
      method: "POST",
      body: { invite: "abcd1234" },
      auth: true,
    });
  });

  it("nickname taken on accept shows field error", async () => {
    answer({
      accept: () => {
        throw new AppError("CONFLICT", "Please fix the highlighted fields.", {
          fieldErrors: { nickname: [nicknameTaken] },
        });
      },
    });
    await renderApp("/invite?code=ABCD1234");
    expect(await screen.findByDisplayValue("Mia")).toBeOnTheScreen();
    await acceptWithPin();

    expect(await screen.findByText(nicknameTaken)).toBeOnTheScreen();
    expect(screen).toHavePathname("/invite");
  });
});

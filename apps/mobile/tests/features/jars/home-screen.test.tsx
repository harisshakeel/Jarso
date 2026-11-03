import { AppError, GENERIC_FAILURE } from "@jarso/core/lib";
import { findNickname, getFamilyContext } from "@jarso/data/family";
import { getJars } from "@jarso/data/ledger";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { HomeScreen } from "@/features/jars";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn(), findNickname: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));

const push = jest.fn();
const jars = getJars as jest.Mock;
const availability = getAvailability as jest.Mock;
const context = getFamilyContext as jest.Mock;

const base = {
  spendMinor: 1250,
  saveMinor: 4000,
  reservedSaveMinor: 0,
  heldSpendMinor: 0,
  availableSaveMinor: 4000,
  availableSpendMinor: 1250,
  takeOutLimitMinor: null,
};

function setup(over: Partial<typeof base> = {}) {
  jars.mockResolvedValue({ spend: 1250, save: 4000 });
  availability.mockResolvedValue({ ...base, ...over });
  context.mockResolvedValue({ currency: "GBP", timezone: "Europe/London", today: "2026-11-02" });
  (findNickname as jest.Mock).mockResolvedValue(null);
}

async function renderHome() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <HomeScreen />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push });
});

describe("HomeScreen", () => {
  it("has a key per screen", () => {
    expect(keys.home("u")).toEqual(["home", "u"]);
    expect(keys.history("u")).toEqual(["history", "u"]);
    expect(keys.requests("u")).toEqual(["requests", "u"]);
  });

  it("greets the child by nickname, like the web Home", async () => {
    setup();
    (findNickname as jest.Mock).mockResolvedValue("Mia");
    await renderHome();
    expect(await screen.findByRole("header", { name: "Hi, Mia!" })).toBeOnTheScreen();
  });

  it("says Hi! when there is no nickname", async () => {
    setup();
    await renderHome();
    expect(await screen.findByRole("header", { name: "Hi!" })).toBeOnTheScreen();
  });

  it("shows both jars with their amounts and captions", async () => {
    setup();
    await renderHome();
    expect(await screen.findByLabelText("Spend jar")).toBeOnTheScreen();
    expect(screen.getByText("£12.50")).toBeOnTheScreen();
    expect(screen.getByText("£40")).toBeOnTheScreen();
    expect(screen.getByText("Cash you have")).toBeOnTheScreen();
    expect(screen.getByText("Kept by your parent")).toBeOnTheScreen();
    expect(screen.getByLabelText("Save jar")).toBeOnTheScreen();
    expect(jars).toHaveBeenCalledWith(expect.anything(), "child-1");
  });

  it("says what is waiting to come out and what is held", async () => {
    setup({ reservedSaveMinor: 500, heldSpendMinor: 300 });
    await renderHome();
    expect(await screen.findByText("£5 · Waiting to come out")).toBeOnTheScreen();
    expect(screen.getByText("£3 to Save · give it to your parent")).toBeOnTheScreen();
  });

  it("shows no reserved or held line when there is none", async () => {
    setup();
    await renderHome();
    await screen.findByLabelText("Spend jar");
    expect(screen.queryByText(/Waiting to come out/)).toBeNull();
    expect(screen.queryByText(/give it to your parent/)).toBeNull();
  });

  it.each([
    ["Spent something?", "/(child)/purchase"],
    ["Put some in Save", "/(child)/put-in"],
    ["Take some out", "/(child)/take-out"],
    ["Ask for extra", "/(child)/ask-extra"],
  ])("opens %s", async (label, href) => {
    setup();
    await renderHome();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: label }));
    expect(push).toHaveBeenCalledWith(href);
  });

  it("refetches on pull to refresh", async () => {
    setup();
    await renderHome();
    await screen.findByLabelText("Spend jar");
    jars.mockResolvedValue({ spend: 2000, save: 4000 });
    const scroll = screen.getByTestId("home-scroll");
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText("£20")).toBeOnTheScreen();
    expect(jars).toHaveBeenCalledTimes(2);
  });

  it("shows a calm message and retries when the jars can't load", async () => {
    setup();
    jars.mockRejectedValueOnce(
      new AppError("UNAVAILABLE", "Jarso is taking a while. Please try again."),
    );
    await renderHome();
    expect(await screen.findByText("Jarso is taking a while. Please try again.")).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("£12.50")).toBeOnTheScreen());
  });

  it("never shows a raw error", async () => {
    setup();
    jars.mockRejectedValueOnce(new Error("relation jars does not exist"));
    await renderHome();
    expect(await screen.findByText(GENERIC_FAILURE)).toBeOnTheScreen();
    expect(screen.queryByText(/relation/)).toBeNull();
  });
});

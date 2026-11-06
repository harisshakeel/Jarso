import { goalCopy } from "@jarso/core/goals";
import { wordCount } from "@jarso/core/home";
import { describeStep, NEXT_STEP_EYEBROW } from "@jarso/core/learning";
import { graphCopy } from "@jarso/core/ledger";
import { AppError, GENERIC_FAILURE } from "@jarso/core/lib";
import { sumDueOccurrences } from "@jarso/data/allowance";
import { findNickname, findParentLabels, getFamilyContext } from "@jarso/data/family";
import { getGoalView } from "@jarso/data/goals";
import { getLearningOverview } from "@jarso/data/learning";
import { getJars, listMovementsSince } from "@jarso/data/ledger";
import { fetchUnreadCount } from "@jarso/data/notifications";
import { getProgress } from "@jarso/data/progress";
import { getAvailability, listRequestsFor } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { HomeScreen, JarTile } from "@/features/home";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/ledger", () => ({
  ...jest.requireActual("@jarso/data/ledger"),
  getJars: jest.fn(),
  listMovementsSince: jest.fn(),
}));
jest.mock("@jarso/data/requests", () => ({
  getAvailability: jest.fn(),
  listRequestsFor: jest.fn(),
}));
jest.mock("@jarso/data/family", () => ({
  getFamilyContext: jest.fn(),
  findNickname: jest.fn(),
  findParentLabels: jest.fn(),
}));
jest.mock("@jarso/data/allowance", () => ({ sumDueOccurrences: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@jarso/data/goals", () => ({ getGoalView: jest.fn() }));
jest.mock("@jarso/data/learning", () => ({ getLearningOverview: jest.fn() }));
jest.mock("@jarso/data/notifications", () => ({
  ...jest.requireActual("@jarso/data/notifications"),
  fetchUnreadCount: jest.fn(),
}));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/components/celebrate", () => ({ useCelebrate: () => jest.fn() }));

const push = jest.fn();
const jars = getJars as jest.Mock;
const step = { kind: "check-in" } as const;
const progress = {
  sparks: 240,
  streak: 5,
  look: { lid: "cyan", wear: "none" },
};
const request = (over: Record<string, unknown> = {}) => ({
  id: "r-1",
  kind: "deposit",
  status: "pending",
  amountMinor: 5000,
  reason: null,
  auto: false,
  occurredAt: "2026-11-02T09:00:00Z",
  ...over,
});

function setup() {
  jars.mockResolvedValue({ spend: 1250, save: 4000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-02",
  });
  (findNickname as jest.Mock).mockResolvedValue("Sam");
  (findParentLabels as jest.Mock).mockResolvedValue(["Mum"]);
  (listRequestsFor as jest.Mock).mockResolvedValue([]);
  (sumDueOccurrences as jest.Mock).mockResolvedValue({ totalMinor: 0, count: 0 });
  (getProgress as jest.Mock).mockResolvedValue(progress);
  (getGoalView as jest.Mock).mockResolvedValue(null);
  (getLearningOverview as jest.Mock).mockResolvedValue({ nextStep: step });
  (fetchUnreadCount as jest.Mock).mockResolvedValue(0);
  (listMovementsSince as jest.Mock).mockResolvedValue([]);
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
  setup();
});

describe("HomeScreen", () => {
  it("greets the child by nickname", async () => {
    await renderHome();
    expect(await screen.findByRole("header", { name: "Hi Sam!" })).toBeOnTheScreen();
  });

  it("says Hi! when there is no nickname", async () => {
    (findNickname as jest.Mock).mockResolvedValue(null);
    await renderHome();
    expect(await screen.findByRole("header", { name: "Hi!" })).toBeOnTheScreen();
  });

  it("shows Spend and Save tiles with their captions", async () => {
    await renderHome();
    expect(await screen.findByText("£12.50")).toBeOnTheScreen();
    expect(screen.getByText("£40")).toBeOnTheScreen();
    expect(screen.getByText("In your pocket")).toBeOnTheScreen();
    expect(await screen.findByText("Mum keeps it")).toBeOnTheScreen();
    expect(jars).toHaveBeenCalledWith(expect.anything(), "child-1");
  });

  it("Spend tile opens the Spend jar page", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.press(await screen.findByRole("button", { name: "Spend £12.50" }));
    expect(push).toHaveBeenCalledWith("/(child)/jar/spend");
  });

  it("Save tile opens the Save jar page", async () => {
    const user = userEvent.setup();
    await renderHome();
    await user.press(await screen.findByRole("button", { name: "Save £40" }));
    expect(push).toHaveBeenCalledWith("/(child)/jar/save");
  });

  it("a tile with onPress is a button named for the jar and amount", async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<JarTile jar="save" amount="£40" caption="Mum keeps it" onPress={onPress} />);
    await user.press(screen.getByRole("button", { name: "Save £40" }));
    expect(onPress).toHaveBeenCalled();
  });

  it("Jarso's bubble says how Save moved", async () => {
    (listMovementsSince as jest.Mock).mockResolvedValue([
      { jar: "save", direction: "in", amountMinor: 4000, occurredAt: "2026-10-31T12:00:00Z" },
    ]);
    await renderHome();
    expect(await screen.findByText("£40 saved this week. Nice!")).toBeOnTheScreen();
  });

  it("shows streak and Sparks", async () => {
    await renderHome();
    expect(await screen.findByLabelText("5 days")).toBeOnTheScreen();
    expect(screen.getByLabelText("240 Sparks")).toBeOnTheScreen();
  });

  it("hides the streak at 0", async () => {
    (getProgress as jest.Mock).mockResolvedValue({ ...progress, streak: 0 });
    await renderHome();
    await screen.findByLabelText("240 Sparks");
    expect(screen.queryByLabelText(/day/)).toBeNull();
  });

  it("the avatar opens Me and the bell opens notifications", async () => {
    (fetchUnreadCount as jest.Mock).mockResolvedValue(2);
    await renderHome();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Me" }));
    expect(push).toHaveBeenCalledWith("/(child)/me");
    await user.press(await screen.findByRole("button", { name: "Notifications, 2 new" }));
    expect(push).toHaveBeenCalledWith("/(child)/news");
  });

  it("a waiting ask replaces the hero", async () => {
    (listRequestsFor as jest.Mock).mockResolvedValue([request()]);
    await renderHome();
    expect(await screen.findByText("Save £50")).toBeOnTheScreen();
    expect(screen.getByText("Give the cash to Mum")).toBeOnTheScreen();
    expect(screen.queryByText(/this week/)).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: /Save £50/ }));
    expect(push).toHaveBeenCalledWith("/(child)/requests");
  });

  it("a yes shows as a moment", async () => {
    (listRequestsFor as jest.Mock).mockResolvedValue([
      request({ kind: "withdrawal", status: "approved", amountMinor: 6000 }),
    ]);
    await renderHome();
    expect(await screen.findByText("Mum said yes!")).toBeOnTheScreen();
    expect(screen.getByText("£60 from savings is coming")).toBeOnTheScreen();
  });

  it("pocket money due shows the amount and is not pressable", async () => {
    (sumDueOccurrences as jest.Mock).mockResolvedValue({ totalMinor: 10000, count: 1 });
    await renderHome();
    expect(await screen.findByText("Pocket money day!")).toBeOnTheScreen();
    expect(screen.getByText("+£100 · Mum hands it over")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Pocket money day/ })).toBeNull();
  });

  it("renders the goal and today's mission", async () => {
    await renderHome();
    expect(await screen.findByText(goalCopy.card.empty)).toBeOnTheScreen();
    expect(await screen.findByText(describeStep(step).title)).toBeOnTheScreen();
  });

  it("no graph, no action list, no push card", async () => {
    await renderHome();
    await screen.findByText("In your pocket");
    expect(screen.queryByText("Move my money")).toBeNull();
    expect(screen.queryByText(graphCopy.title)).toBeNull();
  });

  it("Home stays up when side reads fail", async () => {
    const fail = () => Promise.reject(new Error("boom"));
    (listRequestsFor as jest.Mock).mockImplementation(fail);
    (sumDueOccurrences as jest.Mock).mockImplementation(fail);
    (getProgress as jest.Mock).mockImplementation(fail);
    (listMovementsSince as jest.Mock).mockImplementation(fail);
    await renderHome();
    expect(await screen.findByText("£12.50")).toBeOnTheScreen();
    expect(screen.getByText("£40")).toBeOnTheScreen();
    expect(await screen.findByText("Good to see you!")).toBeOnTheScreen();
  });

  it("big balances stay on one line", async () => {
    jars.mockResolvedValue({ spend: 1_234_567_800, save: 100 });
    await renderHome();
    const amount = await screen.findByText("£12,345,678");
    expect(amount.props.numberOfLines).toBe(1);
    expect(amount.props.adjustsFontSizeToFit).toBe(true);
  });

  /** Words Home shows outside the goal card and the mission card (the 30-word Home limit). */
  async function wordsOutsideCards() {
    type Node = {
      type: string;
      props: Record<string, unknown>;
      children: (Node | string)[] | null;
    };
    // Sum the words in every Text, skipping the goal card's subtree.
    const words = (node: Node | string): number => {
      if (typeof node === "string") return 0;
      if (node.props.accessibilityLabel === goalCopy.card.heading) return 0;
      const kids = node.children ?? [];
      if (node.type === "Text") {
        return kids.reduce<number>((n, k) => n + (typeof k === "string" ? wordCount(k) : 0), 0);
      }
      return kids.reduce<number>((n, k) => n + words(k), 0);
    };
    const { title, body, cta } = describeStep(step);
    const mission = [NEXT_STEP_EYEBROW, title, body, cta].reduce((n, t) => n + wordCount(t), 0);
    return words(screen.toJSON() as unknown as Node) - mission;
  }

  it("fits the word budget", async () => {
    await renderHome();
    await screen.findByText(describeStep(step).title);
    await screen.findByText("Mum keeps it");
    await screen.findByLabelText("240 Sparks");
    expect(await wordsOutsideCards()).toBeLessThanOrEqual(30);
  });

  it("fits the word budget with a moment card showing", async () => {
    (listRequestsFor as jest.Mock).mockResolvedValue([request()]);
    await renderHome();
    await screen.findByText(describeStep(step).title);
    await screen.findByText("Mum keeps it");
    await screen.findByLabelText("240 Sparks");
    expect(await screen.findByText("Save £50")).toBeOnTheScreen();
    expect(await wordsOutsideCards()).toBeLessThanOrEqual(30);
  });

  it("fits the word budget with two moment cards showing", async () => {
    (listRequestsFor as jest.Mock).mockResolvedValue([
      request({ id: "r-2", kind: "withdrawal", status: "approved", amountMinor: 6000 }),
      request(),
    ]);
    (sumDueOccurrences as jest.Mock).mockResolvedValue({ totalMinor: 10000, count: 1 });
    await renderHome();
    await screen.findByText(describeStep(step).title);
    await screen.findByText("Mum said yes!");
    await screen.findByText("Pocket money day!");
    expect(screen.queryByText("Save £50")).toBeNull();
    expect(await wordsOutsideCards()).toBeLessThanOrEqual(30);
  });

  it("a moment card's label includes its chip", async () => {
    (listRequestsFor as jest.Mock).mockResolvedValue([request()]);
    await renderHome();
    expect(
      await screen.findByRole("button", { name: "Save £50 Give the cash to Mum Waiting" }),
    ).toBeOnTheScreen();
  });

  it("has a key per screen", () => {
    expect(keys.home("u")).toEqual(["home", "u"]);
    expect(keys.allowanceDue("u")).toEqual(["home", "u", "due"]);
    expect(keys.homeWeek("u")).toEqual(["home", "u", "week"]);
  });

  it("refetches on pull to refresh", async () => {
    await renderHome();
    await screen.findByText("£12.50");
    jars.mockResolvedValue({ spend: 2000, save: 4000 });
    const scroll = screen.getByTestId("home-scroll");
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText("£20")).toBeOnTheScreen();
    expect(jars).toHaveBeenCalledTimes(2);
  });

  it("shows a calm message and retries when the jars can't load", async () => {
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
    jars.mockRejectedValueOnce(new Error("relation jars does not exist"));
    await renderHome();
    expect(await screen.findByText(GENERIC_FAILURE)).toBeOnTheScreen();
    expect(screen.queryByText(/relation/)).toBeNull();
  });
});

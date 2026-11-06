import { GENERIC_FAILURE } from "@jarso/core/lib";
import { findParentLabels, getFamilyContext } from "@jarso/data/family";
import { getGoalView } from "@jarso/data/goals";
import { getJars, listMovementsSince } from "@jarso/data/ledger";
import { getProgress } from "@jarso/data/progress";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import JarRoute from "@/../app/(child)/jar/[jar]";
import { JarScreen } from "@/features/jars";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/ledger", () => ({
  ...jest.requireActual("@jarso/data/ledger"),
  getJars: jest.fn(),
  listMovementsSince: jest.fn(),
}));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({
  getFamilyContext: jest.fn(),
  findParentLabels: jest.fn(),
}));
jest.mock("@jarso/data/goals", () => ({ getGoalView: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text>{`redirect:${href}`}</Text>;
  },
  Stack: { Screen: () => null },
}));

const push = jest.fn();

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

// today 2026-11-06 (Fri): this week starts Mon 2026-11-02, last week Mon 2026-10-26.
const move = (
  jar: "spend" | "save",
  direction: "in" | "out",
  amountMinor: number,
  occurredAt: string,
) => ({ jar, direction, amountMinor, occurredAt });

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1250, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-06",
  });
  (findParentLabels as jest.Mock).mockResolvedValue(["Mum"]);
  (getGoalView as jest.Mock).mockResolvedValue(null);
  (getProgress as jest.Mock).mockResolvedValue({ look: undefined });
  (listMovementsSince as jest.Mock).mockResolvedValue([
    move("save", "in", 500, "2026-10-28T10:00:00Z"),
    move("save", "in", 1000, "2026-11-03T10:00:00Z"),
    move("spend", "out", 300, "2026-10-28T10:00:00Z"),
    move("spend", "out", 800, "2026-11-03T10:00:00Z"),
  ]);
});

describe("JarScreen", () => {
  it("save page shows the big jar, the amount and who keeps it", async () => {
    await render(wrap(<JarScreen jar="save" />));
    expect(await screen.findByText("£20")).toBeOnTheScreen();
    expect(await screen.findByText("Mum keeps it safe")).toBeOnTheScreen();
  });

  it("falls back to your parent", async () => {
    (findParentLabels as jest.Mock).mockResolvedValue([]);
    await render(wrap(<JarScreen jar="save" />));
    expect(await screen.findByText("Your parent keeps it safe")).toBeOnTheScreen();
  });

  it("save page shows six weekly bars and the week line", async () => {
    await render(wrap(<JarScreen jar="save" />));
    expect(await screen.findByText("Saved each week")).toBeOnTheScreen();
    expect(await screen.findByText("£5 more than last week!")).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Save jar, last 6 weeks:/)).toBeOnTheScreen();
  });

  it("save actions open Save some and Use savings", async () => {
    const user = userEvent.setup();
    await render(wrap(<JarScreen jar="save" />));
    await user.press(await screen.findByRole("button", { name: "Save some" }));
    expect(push).toHaveBeenCalledWith("/(child)/put-in");
    await user.press(screen.getByRole("button", { name: "Use savings" }));
    expect(push).toHaveBeenCalledWith("/(child)/take-out");
  });

  it("spend page uses teal, neutral words and its own actions", async () => {
    const user = userEvent.setup();
    await render(wrap(<JarScreen jar="spend" />));
    expect(await screen.findByText("Each week")).toBeOnTheScreen();
    expect(await screen.findByText("Cash you have")).toBeOnTheScreen();
    expect(await screen.findByText("Spend dropped £5 more than last week.")).toBeOnTheScreen();
    expect(screen.queryByText(/!$/)).not.toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "I bought something" }));
    expect(push).toHaveBeenCalledWith("/(child)/purchase");
    await user.press(screen.getByRole("button", { name: "I got money" }));
    expect(push).toHaveBeenCalledWith("/(child)/received");
  });

  it("bars hide while history fails, the jar and actions stay", async () => {
    (listMovementsSince as jest.Mock).mockRejectedValue(new Error("boom"));
    await render(wrap(<JarScreen jar="save" />));
    expect(await screen.findByText("£20")).toBeOnTheScreen();
    await waitFor(() => expect(listMovementsSince).toHaveBeenCalled());
    expect(screen.queryByText("Saved each week")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save some" })).toBeOnTheScreen();
  });

  it("a calm retry when the jars can't load", async () => {
    (getJars as jest.Mock).mockRejectedValue(new Error("raw database boom"));
    await render(wrap(<JarScreen jar="save" />));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.queryByText(/boom/)).not.toBeOnTheScreen();
    expect(screen.getByText(GENERIC_FAILURE)).toBeOnTheScreen();
  });

  it("route redirects an unknown jar", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ jar: "piggy" });
    await render(wrap(<JarRoute />));
    expect(screen.getByText("redirect:/(child)/(tabs)")).toBeOnTheScreen();
  });
});

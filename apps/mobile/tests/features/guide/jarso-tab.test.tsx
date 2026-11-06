import { guideUi, jarsoTabCopy } from "@jarso/core/guide";
import { findParentLabels, getFamilyContext } from "@jarso/data/family";
import { getJars } from "@jarso/data/ledger";
import { getProgress } from "@jarso/data/progress";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { GuideThread, JarsoScreen } from "@/features/guide";
import { apiFetch } from "@/lib/api";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/guide", () => ({
  listMyChats: jest.fn().mockResolvedValue([]),
  getMyTranscript: jest.fn(),
  listMemories: jest.fn().mockResolvedValue([]),
  deleteMemory: jest.fn(),
  rateMessage: jest.fn(),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({
  getFamilyContext: jest.fn(),
  findParentLabels: jest.fn(),
}));
jest.mock("@jarso/data/progress", () => ({
  getProgress: jest.fn(),
  setJarsoLook: jest.fn(),
  dailyCheckin: jest.fn(),
}));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));

const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
const fetchMock = jest.fn();

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  (useRouter as jest.Mock).mockReturnValue(router);
  (apiFetch as jest.Mock).mockResolvedValue({ available: true, introNeeded: false });
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-06",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (findParentLabels as jest.Mock).mockResolvedValue(["mum"]);
  (getProgress as jest.Mock).mockResolvedValue({
    sparks: 10,
    level: 1,
    streak: 1,
    look: { lid: "grape", wear: "cap" },
    badges: [],
  });
});

describe("Jarso tab", () => {
  it("shows Jarso, Ask me anything and the AI notice with the parent's name", async () => {
    await render(wrap(<JarsoScreen />));
    expect(await screen.findByRole("header", { name: jarsoTabCopy.heading })).toBeOnTheScreen();
    expect(await screen.findByText(jarsoTabCopy.notice("mum"))).toBeOnTheScreen();
  });

  it("a starter opens a new chat with the question typed", async () => {
    await render(wrap(<JarsoScreen />));
    const starter = jarsoTabCopy.starters[0];
    await userEvent.press(await screen.findByRole("button", { name: starter.question }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(child)/jarso/[conversationId]",
      params: { conversationId: "new", draft: starter.question },
    });
  });

  it("New chat still opens an empty chat", async () => {
    await render(wrap(<JarsoScreen />));
    await userEvent.press(await screen.findByRole("button", { name: guideUi.newChat }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(child)/jarso/[conversationId]",
      params: { conversationId: "new" },
    });
  });

  it("the draft fills the composer but is not sent", async () => {
    await render(
      wrap(
        <GuideThread context={{ entry: "home" }} introNeeded={false} draft="What's a bank for?" />,
      ),
    );
    expect(screen.getByDisplayValue("What's a bank for?")).toBeOnTheScreen();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

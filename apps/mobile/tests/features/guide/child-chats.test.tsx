import { guideCopy, parentGuideCopy } from "@jarso/core/guide";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import {
  deleteMemory,
  getChildTranscript,
  listChildChats,
  listMemories,
  saveGuideAccess,
} from "@jarso/data/guide";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ChildGuideChatScreen, ChildGuideScreen } from "@/features/parent";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
}));
jest.mock("@jarso/data/guide", () => ({
  listChildChats: jest.fn(),
  getChildTranscript: jest.fn(),
  listMemories: jest.fn(),
  deleteMemory: jest.fn(),
  saveGuideAccess: jest.fn(),
}));

const SAM = { id: "11111111-1111-4111-8111-111111111111", nickname: "Sam" };
const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() };

const chat = (id: string, label: string, flagged: boolean) => ({
  id,
  childId: SAM.id,
  entry: "home",
  label,
  createdAt: "2026-11-02T10:00:00Z",
  lastMessageAt: "2026-11-02T10:00:00Z",
  turns: 2,
  flagged,
  preview: `${label} preview`,
});

const memory = {
  id: "77777777-7777-4777-8777-777777777777",
  kind: "interest",
  text: "football",
  createdAt: "2026-11-01T10:00:00Z",
  expiresAt: "2027-11-01T10:00:00Z",
};

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue(router);
  (apiFetch as jest.Mock).mockResolvedValue({ configured: true, enabledChildIds: [SAM.id] });
  (findMembership as jest.Mock).mockResolvedValue({ familyId: "fam-1", role: "parent" });
  (findFamilyById as jest.Mock).mockResolvedValue({
    id: "fam-1",
    code: "ABC123",
    currency: "GBP",
    timezone: "Europe/London",
  });
  (listChildMembers as jest.Mock).mockResolvedValue([SAM]);
  (listChildChats as jest.Mock).mockResolvedValue([
    chat("c-flagged", "Asked from Home", true),
    chat("c-plain", "Topic: Saving", false),
  ]);
  (listMemories as jest.Mock).mockResolvedValue([]);
  (saveGuideAccess as jest.Mock).mockResolvedValue(undefined);
});

describe("a child's Jarso chats", () => {
  it("child chats flagged first", async () => {
    const user = userEvent.setup();
    await render(wrap(<ChildGuideScreen childId={SAM.id} />));
    const list = within(await screen.findByLabelText(parentGuideCopy.chatsLabel));
    const rows = list.getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName(/^Asked from Home/);
    expect(rows[0]).toHaveAccessibleName(new RegExp(parentGuideCopy.worthALook));
    expect(rows[1]).toHaveAccessibleName(/^Topic: Saving/);
    expect(list.getAllByText(parentGuideCopy.worthALook)).toHaveLength(1);
    expect(
      screen.getByRole("switch", { name: parentGuideCopy.switchLabel("Sam") }),
    ).toBeOnTheScreen();
    await user.press(list.getByRole("button", { name: /^Topic: Saving/ }));
    expect(router.push).toHaveBeenCalledWith(`/(parent)/children/${SAM.id}/guide/c-plain`);
    expect(listChildChats).toHaveBeenCalledWith(supabase, SAM.id);
  });

  it("forget memory removes it", async () => {
    (listMemories as jest.Mock).mockResolvedValueOnce([memory]).mockResolvedValue([]);
    (deleteMemory as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(wrap(<ChildGuideScreen childId={SAM.id} />));
    expect(await screen.findByText(parentGuideCopy.memoriesIntro("Sam"))).toBeOnTheScreen();
    await user.press(
      await screen.findByRole("button", { name: `${guideCopy.memories.forget}: football` }),
    );
    expect(deleteMemory).toHaveBeenCalledWith(supabase, memory.id);
    expect(await screen.findByText(guideCopy.memories.empty)).toBeOnTheScreen();
    expect(screen.queryByText("football")).toBeNull();
    expect(listMemories).toHaveBeenCalledWith(supabase, SAM.id);
  });

  it("a chat reads as the parent sees it, and a missing one goes back", async () => {
    (getChildTranscript as jest.Mock).mockResolvedValueOnce({
      summary: { ...chat("c-plain", "Topic: Saving", false) },
      messages: [
        {
          id: "m1",
          role: "child",
          text: "How do I save?",
          route: null,
          flagged: false,
          rating: null,
          createdAt: "2026-11-02T10:00:00Z",
          hidden: false,
          lookedAt: [],
        },
        {
          id: "m2",
          role: "guide",
          text: "Put a little in Save each week.",
          route: "on_topic",
          flagged: false,
          rating: 1,
          createdAt: "2026-11-02T10:01:00Z",
          hidden: false,
          lookedAt: ["jars"],
        },
      ],
    });
    const first = await render(
      wrap(<ChildGuideChatScreen childId={SAM.id} conversationId="c-plain" />),
    );
    expect(await screen.findByText("Put a little in Save each week.")).toBeOnTheScreen();
    expect(screen.getByText(parentGuideCopy.lookedAt(["jars"]))).toBeOnTheScreen();
    expect(screen.getByText(parentGuideCopy.helpful)).toBeOnTheScreen();
    expect(getChildTranscript).toHaveBeenCalledWith(supabase, SAM.id, "c-plain");
    await first.unmount();

    (getChildTranscript as jest.Mock).mockResolvedValueOnce(null);
    await render(wrap(<ChildGuideChatScreen childId={SAM.id} conversationId="c-gone" />));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });
});

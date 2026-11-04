import type { ActionProposal, GuideReply, GuideTurnEvent } from "@jarso/core/guide";
import { guideCopy, guideUi, parentGuideCopy } from "@jarso/core/guide";
import { offlineCopy } from "@jarso/core/offline";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import { getAskerTranscript, listChatsAskedBy, saveGuideAccess } from "@jarso/data/guide";
import { findParentDetails, findProfileById } from "@jarso/data/profiles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { GuideSwitch } from "@/features/guide";
import { ParentJarsoScreen } from "@/features/parent";
import { apiFetch } from "@/lib/api";
import { dispatchNotices } from "@/lib/notices";
import { supabase } from "@/lib/supabase/client";

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
}));
jest.mock("@jarso/data/profiles", () => ({
  findProfileById: jest.fn(),
  findParentDetails: jest.fn(),
}));
jest.mock("@jarso/data/guide", () => ({
  listChatsAskedBy: jest.fn(),
  getAskerTranscript: jest.fn(),
  saveGuideAccess: jest.fn(),
  rateMessage: jest.fn(),
}));
let mockIds = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockIds).padStart(12, "0")}`,
}));

const SAM = { id: "11111111-1111-4111-8111-111111111111", nickname: "Sam" };
const AVA = { id: "22222222-2222-4222-8222-222222222222", nickname: "Ava" };
const CONVERSATION_ID = "66666666-6666-4666-8666-666666666666";
const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
const fetchMock = jest.fn();
let enabled = [SAM.id, AVA.id];

const proposal: ActionProposal = {
  kind: "action",
  draft: {
    kind: "record_gift",
    id: "33333333-3333-4333-8333-333333333333",
    childId: AVA.id,
    amountMinor: 500,
    jar: "save",
    note: "Birthday",
  },
  title: "Record a gift for Ava",
  lines: [{ label: "Amount", value: "£5.00" }],
};

const reply = (over: Partial<GuideReply> = {}): GuideReply => ({
  messageId: "55555555-5555-4555-8555-555555555555",
  rating: null,
  role: "guide",
  text: "Ava has £10 in Spend.",
  route: "on_topic",
  topics: [],
  check: null,
  helplines: [],
  lookedAt: ["jars"],
  remembered: [],
  ...over,
});

/** A finished NDJSON reply. */
function replied(over: Partial<GuideReply> = {}) {
  const event: GuideTurnEvent = {
    type: "reply",
    data: { conversationId: CONVERSATION_ID, reply: reply(over), turnsLeft: 11 },
  };
  const chunks = [new TextEncoder().encode(`${JSON.stringify(event)}\n`)];
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => {
          const value = chunks.shift();
          return Promise.resolve(value ? { value, done: false } : { done: true });
        },
      }),
    },
  };
}

const sentBody = (call: number) =>
  JSON.parse((fetchMock.mock.calls[call] as [string, { body: string }])[1].body) as {
    clientMessageId: string;
    context: unknown;
    text: string;
  };

let client: QueryClient;
function wrap(ui: ReactNode) {
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  enabled = [SAM.id, AVA.id];
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  (useRouter as jest.Mock).mockReturnValue(router);
  (apiFetch as jest.Mock).mockImplementation(async (path: string) => {
    if (path === "/api/v1/guide/state") return { configured: true, enabledChildIds: enabled };
    if (path === "/api/v1/guide/drafts/confirm") {
      return { status: "done", text: "Done: £5 is written down in Save.", figures: null };
    }
    throw new Error(`unexpected ${path}`);
  });
  (findMembership as jest.Mock).mockResolvedValue({ familyId: "fam-1", role: "parent" });
  (findFamilyById as jest.Mock).mockResolvedValue({
    id: "fam-1",
    code: "ABC123",
    currency: "GBP",
    timezone: "Europe/London",
  });
  (listChildMembers as jest.Mock).mockResolvedValue([SAM, AVA]);
  (findProfileById as jest.Mock).mockResolvedValue({ fullName: "Priya Shah" });
  (findParentDetails as jest.Mock).mockResolvedValue(null);
  (listChatsAskedBy as jest.Mock).mockResolvedValue([]);
  (getAskerTranscript as jest.Mock).mockResolvedValue(null);
  (saveGuideAccess as jest.Mock).mockResolvedValue(undefined);
});

describe("Jarso for parents", () => {
  it("parent turn sends entry parent with the chosen child", async () => {
    fetchMock.mockResolvedValue(replied());
    const user = userEvent.setup();
    await render(wrap(<ParentJarsoScreen />));
    // The picker is folded: open it on the picked child, then choose.
    await user.press(await screen.findByRole("button", { name: `${guideCopy.parent.pick} Sam` }));
    await user.press(screen.getByRole("button", { name: "Ava" }));
    expect(screen.getByText(guideCopy.parent.disclosure("Ava"))).toBeOnTheScreen();
    await user.type(screen.getByLabelText(guideUi.questionLabel), "How is Ava doing?");
    await user.press(screen.getByRole("button", { name: guideUi.ask }));
    expect(await screen.findByText(reply().text)).toBeOnTheScreen();
    expect(sentBody(0).context).toEqual({ entry: "parent", childId: AVA.id });
    expect(sentBody(0).text).toBe("How is Ava doing?");
    // The parent's own words, not the child's thumbs.
    expect(screen.queryByRole("button", { name: guideUi.helpful })).toBeNull();
  });

  it("retry reuses clientMessageId", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(replied());
    const user = userEvent.setup();
    await render(wrap(<ParentJarsoScreen />));
    const box = await screen.findByLabelText(guideUi.questionLabel);
    await user.type(box, "What did Sam spend?");
    await user.press(screen.getByRole("button", { name: guideUi.ask }));
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();
    expect(screen.getByLabelText(guideUi.questionLabel)).toHaveDisplayValue("What did Sam spend?");
    await user.press(screen.getByRole("button", { name: guideUi.ask }));
    expect(await screen.findByText(reply().text)).toBeOnTheScreen();
    expect(sentBody(1).clientMessageId).toBe(sentBody(0).clientMessageId);
    expect(sentBody(1).context).toEqual({ entry: "parent", childId: SAM.id });
  });

  it("Do it posts the draft and shows the outcome", async () => {
    fetchMock.mockResolvedValue(replied({ proposal }));
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const user = userEvent.setup();
    await render(wrap(<ParentJarsoScreen />));
    // The picker is folded: open it on the picked child, then choose.
    await user.press(await screen.findByRole("button", { name: `${guideCopy.parent.pick} Sam` }));
    await user.press(screen.getByRole("button", { name: "Ava" }));
    await user.type(screen.getByLabelText(guideUi.questionLabel), "Ava got £5 for her birthday");
    await user.press(screen.getByRole("button", { name: guideUi.ask }));
    expect(await screen.findByText(proposal.title)).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: guideCopy.action.doIt }));
    expect(await screen.findByText("Done: £5 is written down in Save.")).toBeOnTheScreen();
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/guide/drafts/confirm", {
      method: "POST",
      body: { draft: proposal.draft },
      auth: true,
    });
    expect(screen.queryByRole("button", { name: guideCopy.action.doIt })).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["family", "parent-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["child", AVA.id] });
    expect(dispatchNotices).toHaveBeenCalled();
  });

  it("switch off hides the child from the chips after refetch", async () => {
    await render(
      wrap(
        <>
          <GuideSwitch childId={AVA.id} nickname="Ava" enabled />
          <ParentJarsoScreen />
        </>,
      ),
    );
    expect(
      await screen.findByRole("button", { name: `${guideCopy.parent.pick} Sam` }),
    ).toBeOnTheScreen();
    enabled = [SAM.id];
    // A Switch reports changes through onValueChange, not a press.
    await fireEvent(
      screen.getByRole("switch", { name: parentGuideCopy.switchLabel("Ava") }),
      "valueChange",
      false,
    );
    expect(saveGuideAccess).toHaveBeenCalledWith(supabase, AVA.id, false);
    // One child left: no picker at all.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: `${guideCopy.parent.pick} Sam` })).toBeNull(),
    );
    expect(screen.getByText(guideCopy.parent.disclosure("Sam"))).toBeOnTheScreen();
  });

  it("with Jarso off for every child, says so with a way Home", async () => {
    enabled = [];
    const user = userEvent.setup();
    await render(wrap(<ParentJarsoScreen />));
    expect(await screen.findByText(parentGuideCopy.offForEveryChild)).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: parentGuideCopy.backHome }));
    expect(router.navigate).toHaveBeenCalledWith("/(parent)/(tabs)");
    expect(screen.queryByLabelText(guideUi.questionLabel)).toBeNull();
  });
});
